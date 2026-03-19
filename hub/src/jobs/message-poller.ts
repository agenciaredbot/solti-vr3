/**
 * Message Poller — Fallback for Evolution API webhook bug
 *
 * Evolution API v2 has a known bug where inbound message webhooks
 * don't fire reliably. This poller checks for new messages every
 * POLL_INTERVAL seconds and processes them as if they came via webhook.
 *
 * It only polls instances that have autoReply enabled.
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { routeService } from '../router/service-router.js'

const POLL_INTERVAL = 15_000 // 15 seconds
let pollTimer: ReturnType<typeof setInterval> | null = null

export function startMessagePoller() {
  if (pollTimer) return

  logger.info({ intervalMs: POLL_INTERVAL }, 'Message poller started')

  // Run immediately, then on interval
  pollAllInstances().catch(err => logger.error({ err }, 'Poller initial run failed'))
  pollTimer = setInterval(() => {
    pollAllInstances().catch(err => logger.error({ err }, 'Poller tick failed'))
  }, POLL_INTERVAL)
}

export function stopMessagePoller() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    logger.info('Message poller stopped')
  }
}

async function pollAllInstances() {
  // Only poll connected instances with autoReply enabled
  const instances = await prisma.whatsappInstance.findMany({
    where: {
      status: 'CONNECTED',
      autoReply: true,
    },
    select: {
      id: true,
      tenantId: true,
      instanceName: true,
      autoReply: true,
    },
  })

  for (const instance of instances) {
    try {
      await pollInstance(instance)
    } catch (err) {
      logger.warn({ err, instanceName: instance.instanceName }, 'Failed to poll instance')
    }
  }
}

async function pollInstance(instance: {
  id: string
  tenantId: string
  instanceName: string
  autoReply: boolean
}) {
  // Fetch recent messages from Evolution
  const result = await routeService({
    tenantId: instance.tenantId,
    service: 'evolution',
    action: 'find_messages',
    params: {
      instanceName: instance.instanceName,
      where: { key: { fromMe: false } },
      limit: 10,
    },
  })

  if (!result.success) return

  const data = result.data as any
  const records = data?.messages?.records || data?.records || (Array.isArray(data) ? data : [])

  for (const msg of records) {
    const key = msg.key
    if (!key?.remoteJid || !key.id) continue

    // Skip group messages and status broadcasts
    if (key.remoteJid.endsWith('@g.us') || key.remoteJid === 'status@broadcast') continue

    // Skip if fromMe
    if (key.fromMe) continue

    const externalId = key.id

    // Idempotency: skip if already processed
    const existing = await prisma.whatsappMessage.findUnique({
      where: { externalId },
    })
    if (existing) continue

    // This is a NEW inbound message — process it
    const messageContent = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || null
    const messageType = msg.message?.imageMessage ? 'image'
      : msg.message?.audioMessage ? 'audio'
      : msg.message?.videoMessage ? 'video'
      : msg.message?.documentMessage ? 'document'
      : 'text'
    const mediaUrl = msg.mediaUrl || null

    // Find or create conversation
    const remoteJid = key.remoteJid
    let conversation = await prisma.whatsappConversation.findFirst({
      where: { instanceId: instance.id, remoteJid },
    })

    // Also try matching by phone without @lid/@s.whatsapp.net suffix
    if (!conversation) {
      const phone = remoteJid.replace(/@.*$/, '')
      const altJids = [
        `${phone}@s.whatsapp.net`,
        `${phone}@lid`,
        remoteJid,
      ]
      for (const jid of altJids) {
        conversation = await prisma.whatsappConversation.findFirst({
          where: { instanceId: instance.id, remoteJid: jid },
        })
        if (conversation) break
      }
    }

    if (!conversation) {
      const phone = remoteJid.replace(/@.*$/, '')
      const contact = await prisma.contact.findFirst({
        where: {
          tenantId: instance.tenantId,
          OR: [
            { whatsapp: phone },
            { phone: phone },
            { whatsapp: `+${phone}` },
            { phone: `+${phone}` },
          ],
        },
      })

      conversation = await prisma.whatsappConversation.create({
        data: {
          tenantId: instance.tenantId,
          instanceId: instance.id,
          remoteJid,
          remoteName: msg.pushName || null,
          contactId: contact?.id || null,
          lastMessageAt: new Date(),
        },
      })
    } else {
      await prisma.whatsappConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          remoteName: msg.pushName || conversation.remoteName,
          unreadCount: { increment: 1 },
        },
      })
    }

    // Store message
    await prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        messageType,
        content: messageContent,
        mediaUrl,
        status: 'DELIVERED',
        externalId,
      },
    })

    // Log activity if contact is linked
    if (conversation.contactId) {
      await prisma.activity.create({
        data: {
          tenantId: instance.tenantId,
          contactId: conversation.contactId,
          type: 'whatsapp',
          title: 'WhatsApp recibido',
          description: messageContent?.substring(0, 200) || `[${messageType}]`,
          metadata: { instanceName: instance.instanceName, direction: 'in' },
        },
      })
    }

    // Enqueue auto-reply
    if (instance.autoReply && messageContent) {
      try {
        const { enqueueAutoReply } = await import('./queue.js')
        await enqueueAutoReply({
          tenantId: instance.tenantId,
          instanceId: instance.id,
          conversationId: conversation.id,
          contactPhone: remoteJid.replace(/@.*$/, ''),
          inboundMessage: messageContent,
          pushName: msg.pushName,
        })
        logger.info({
          instanceName: instance.instanceName,
          remoteJid,
          messagePreview: messageContent.substring(0, 50),
        }, 'Auto-reply enqueued via poller')
      } catch (err) {
        logger.warn({ err }, 'Failed to enqueue auto-reply from poller')
      }
    }

    // Update daily metrics
    const today = new Date().toISOString().split('T')[0]
    await prisma.dailyMetric.upsert({
      where: {
        tenantId_date: {
          tenantId: instance.tenantId,
          date: new Date(today),
        },
      },
      create: {
        tenantId: instance.tenantId,
        date: new Date(today),
        whatsappMessagesIn: 1,
      },
      update: {
        whatsappMessagesIn: { increment: 1 },
      },
    })

    logger.info({
      tenantId: instance.tenantId,
      instanceName: instance.instanceName,
      direction: 'in',
      remoteJid,
      externalId,
      source: 'poller',
    }, 'WhatsApp message processed (via poller)')
  }
}
