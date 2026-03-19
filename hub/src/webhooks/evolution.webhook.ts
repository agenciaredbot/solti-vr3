/**
 * Evolution API Webhook Handler (Enhanced)
 *
 * Receives WhatsApp events from Evolution API:
 * - messages.upsert    → Inbound/outbound messages
 * - connection.update  → Instance connection state changes
 * - qrcode.updated     → QR code refreshed
 * - messages.update    → Message status updates (delivered, read)
 * - send.message       → Outbound message confirmation
 *
 * Enhancements over v1:
 * - WebhookEvent buffer table (Evolution doesn't retry, so we store raw first)
 * - Campaign correlation by externalMessageId (not phone number)
 * - Idempotency via externalId unique constraint
 * - Auto-reply enqueuing for inbound messages
 * - Campaign stats updates for delivery/read events
 *
 * Webhook URL: POST /webhooks/evolution
 * No auth — verified by matching instanceName to solti- prefix.
 */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { notifyInstanceDisconnected, notifyInstanceNeedsQR, notifyCampaignPaused } from '../services/notification.service.js'

const evolutionWebhook = new Hono()

interface EvolutionEvent {
  event: string
  instance: string
  data: any
  destination?: string
  sender?: string
  date_time?: string
  server_url?: string
  apikey?: string
}

// Normalize event names: Evolution v2 can send MESSAGES_UPSERT or messages.upsert
function normalizeEvent(raw: string): string {
  // Convert SCREAMING_SNAKE_CASE to dot.lowercase: MESSAGES_UPSERT → messages.upsert
  if (raw.includes('_') && raw === raw.toUpperCase()) {
    // Split on first underscore for two-part events, handle special cases
    const map: Record<string, string> = {
      'MESSAGES_UPSERT': 'messages.upsert',
      'MESSAGES_UPDATE': 'messages.update',
      'MESSAGES_DELETE': 'messages.delete',
      'MESSAGES_SET': 'messages.set',
      'MESSAGES_EDITED': 'messages.edited',
      'CONNECTION_UPDATE': 'connection.update',
      'QRCODE_UPDATED': 'qrcode.updated',
      'SEND_MESSAGE': 'send.message',
      'SEND_MESSAGE_UPDATE': 'send.message.update',
      'CONTACTS_UPSERT': 'contacts.upsert',
      'CONTACTS_UPDATE': 'contacts.update',
      'CONTACTS_SET': 'contacts.set',
      'CHATS_UPSERT': 'chats.upsert',
      'CHATS_UPDATE': 'chats.update',
      'CHATS_DELETE': 'chats.delete',
      'CHATS_SET': 'chats.set',
      'PRESENCE_UPDATE': 'presence.update',
      'GROUPS_UPSERT': 'groups.upsert',
      'GROUP_UPDATE': 'group.update',
      'GROUP_PARTICIPANTS_UPDATE': 'group-participants.update',
      'LABELS_EDIT': 'labels.edit',
      'LABELS_ASSOCIATION': 'labels.association',
      'CALL': 'call',
      'STATUS_INSTANCE': 'status.instance',
      'REMOVE_INSTANCE': 'remove.instance',
      'LOGOUT_INSTANCE': 'logout.instance',
      'INSTANCE_CREATE': 'instance.create',
      'INSTANCE_DELETE': 'instance.delete',
      'APPLICATION_STARTUP': 'application.startup',
    }
    return map[raw] || raw.toLowerCase().replace(/_/g, '.')
  }
  return raw
}

// ═══ POST / — Handle Evolution API webhook ═══
evolutionWebhook.post('/', async (c) => {
  let body: EvolutionEvent
  try {
    body = await c.req.json() as EvolutionEvent
  } catch {
    logger.warn('Webhook received invalid JSON body')
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const rawEvent = body.event
  const instanceName = body.instance
  const data = body.data

  // Normalize event name (MESSAGES_UPSERT → messages.upsert)
  const event = rawEvent ? normalizeEvent(rawEvent) : ''

  // Log ALL incoming webhook events
  logger.info({ rawEvent, event, instanceName, dataKeys: data ? Object.keys(data) : 'no-data' }, 'Evolution webhook received')

  if (!event || !instanceName) {
    logger.warn({ bodyKeys: Object.keys(body) }, 'Invalid webhook payload — missing event or instance')
    return c.json({ error: 'Invalid webhook payload' }, 400)
  }

  // Only process solti- instances
  if (!instanceName.startsWith('solti-')) {
    return c.json({ ok: true })
  }

  // Find the instance in DB
  const instance = await prisma.whatsappInstance.findFirst({
    where: { instanceName },
    select: { id: true, tenantId: true, instanceName: true, autoReply: true },
  })

  if (!instance) {
    logger.warn({ instanceName, event }, 'Webhook for unknown instance')
    return c.json({ ok: true })
  }

  // Buffer: store raw event first (Evolution doesn't retry on failure)
  try {
    await prisma.webhookEvent.create({
      data: {
        tenantId: instance.tenantId,
        source: 'evolution',
        event,
        instanceName,
        payload: JSON.parse(JSON.stringify(body)),
      },
    })
  } catch (bufferErr) {
    logger.warn({ bufferErr, event, instanceName }, 'Failed to buffer webhook event')
  }

  // Process event (respond 200 immediately even if processing fails)
  try {
    switch (event) {
      case 'messages.upsert':
      case 'send.message':
        await handleMessageUpsert(instance, data)
        break
      case 'connection.update':
        await handleConnectionUpdate(instance, data)
        break
      case 'qrcode.updated':
        await handleQrUpdate(instance, data)
        break
      case 'messages.update':
        await handleMessageStatusUpdate(instance, data)
        break
      default:
        logger.debug({ event, instanceName }, 'Unhandled Evolution webhook event')
    }
  } catch (err) {
    logger.error({ err, event, instanceName }, 'Error processing Evolution webhook')
  }

  return c.json({ ok: true })
})

// ═══ Message handlers ═══

async function handleMessageUpsert(
  instance: { id: string; tenantId: string; instanceName: string; autoReply: boolean },
  data: any
) {
  const messages = Array.isArray(data) ? data : [data]

  for (const msg of messages) {
    const key = msg.key
    if (!key?.remoteJid) continue

    // Skip group messages and status broadcasts
    if (key.remoteJid.endsWith('@g.us') || key.remoteJid === 'status@broadcast') continue

    const externalId = key.id || null

    // Idempotency: skip if we already processed this message
    if (externalId) {
      const existing = await prisma.whatsappMessage.findUnique({
        where: { externalId },
      })
      if (existing) continue
    }

    const isFromMe = key.fromMe === true
    const remoteJid = key.remoteJid
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
    let conversation = await prisma.whatsappConversation.findFirst({
      where: { instanceId: instance.id, remoteJid },
    })

    if (!conversation) {
      const phone = remoteJid.replace('@s.whatsapp.net', '')
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
          unreadCount: isFromMe ? conversation.unreadCount : { increment: 1 },
        },
      })
    }

    // Store message
    await prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        direction: isFromMe ? 'OUTBOUND' : 'INBOUND',
        messageType,
        content: messageContent,
        mediaUrl,
        status: isFromMe ? 'SENT' : 'DELIVERED',
        externalId,
        sentAt: isFromMe ? new Date() : undefined,
      },
    })

    // Log activity if contact is linked
    if (conversation.contactId) {
      await prisma.activity.create({
        data: {
          tenantId: instance.tenantId,
          contactId: conversation.contactId,
          type: 'whatsapp',
          title: isFromMe ? 'WhatsApp enviado' : 'WhatsApp recibido',
          description: messageContent?.substring(0, 200) || `[${messageType}]`,
          metadata: { instanceName: instance.instanceName, direction: isFromMe ? 'out' : 'in' },
        },
      })

      if (isFromMe) {
        await prisma.contact.update({
          where: { id: conversation.contactId },
          data: { lastContactedAt: new Date() },
        })
      }
    }

    // Campaign correlation: if inbound, check if contact is a campaign recipient
    if (!isFromMe) {
      const phone = remoteJid.replace('@s.whatsapp.net', '')
      await correlateCampaignReply(instance.tenantId, phone)

      // Enqueue auto-reply if enabled
      if (instance.autoReply && messageContent) {
        try {
          const { enqueueAutoReply } = await import('../jobs/queue.js')
          await enqueueAutoReply({
            tenantId: instance.tenantId,
            instanceId: instance.id,
            conversationId: conversation.id,
            contactPhone: phone,
            inboundMessage: messageContent,
            pushName: msg.pushName,
          })
        } catch (err) {
          logger.warn({ err }, 'Failed to enqueue auto-reply')
        }
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
        whatsappMessagesIn: isFromMe ? 0 : 1,
        whatsappMessagesOut: isFromMe ? 1 : 0,
      },
      update: isFromMe
        ? { whatsappMessagesOut: { increment: 1 } }
        : { whatsappMessagesIn: { increment: 1 } },
    })

    logger.info({
      tenantId: instance.tenantId,
      instanceName: instance.instanceName,
      direction: isFromMe ? 'out' : 'in',
      remoteJid,
      externalId,
    }, 'WhatsApp message processed')
  }
}

async function handleConnectionUpdate(
  instance: { id: string; tenantId: string; instanceName: string; autoReply: boolean },
  data: any
) {
  const state = data?.state || data?.instance?.state
  if (!state) return

  const statusMap: Record<string, string> = {
    open: 'CONNECTED',
    close: 'DISCONNECTED',
    connecting: 'CONNECTING',
  }

  const newStatus = statusMap[state] || 'DISCONNECTED'

  const updateData: Record<string, unknown> = {
    status: newStatus,
  }
  if (newStatus === 'CONNECTED') updateData.connectedAt = new Date()
  if (newStatus === 'DISCONNECTED') updateData.disconnectedAt = new Date()

  await prisma.whatsappInstance.update({
    where: { id: instance.id },
    data: updateData,
  })

  // If disconnected, check if any active campaigns use this instance
  if (newStatus === 'DISCONNECTED') {
    const activeCampaigns = await prisma.campaign.findMany({
      where: {
        tenantId: instance.tenantId,
        type: 'whatsapp',
        status: 'SENDING',
      },
      select: { id: true, settings: true },
    })

    for (const campaign of activeCampaigns) {
      // Check if ALL instances for this tenant are down
      const connectedCount = await prisma.whatsappInstance.count({
        where: { tenantId: instance.tenantId, status: 'CONNECTED' },
      })

      if (connectedCount === 0) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'PAUSED', pausedAt: new Date() },
        })
        logger.warn({ campaignId: campaign.id }, 'Campaign auto-paused: all instances disconnected')
        notifyCampaignPaused(instance.tenantId, campaign.id, 'Todas las instancias desconectadas').catch(() => {})
      }
    }

    // Notify: all instances down or single one
    const totalConnected = await prisma.whatsappInstance.count({
      where: { tenantId: instance.tenantId, status: 'CONNECTED' },
    })
    notifyInstanceDisconnected(instance.tenantId, instance.instanceName, totalConnected === 0).catch(() => {})
  }

  logger.info({ instanceName: instance.instanceName, state, status: newStatus }, 'WhatsApp connection state updated')
}

async function handleQrUpdate(
  instance: { id: string; tenantId: string; instanceName: string; autoReply: boolean },
  data: any
) {
  // QR can be in data.qrcode.base64 or data.base64
  const qrCode = data?.qrcode?.base64 || data?.qrcode || data?.base64

  if (qrCode) {
    await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: { qrCode, status: 'NEEDS_QR' as any },
    })
    notifyInstanceNeedsQR(instance.tenantId, instance.instanceName).catch(() => {})
    logger.info({ instanceName: instance.instanceName }, 'QR code updated — needs scan')
  }
}

async function handleMessageStatusUpdate(
  instance: { id: string; tenantId: string; instanceName: string; autoReply: boolean },
  data: any
) {
  const updates = Array.isArray(data) ? data : [data]

  for (const update of updates) {
    const externalId = update.keyId || update.key?.id
    if (!externalId) continue

    const statusMap: Record<string, string> = {
      DELIVERY_ACK: 'DELIVERED',
      READ: 'READ',
      PLAYED: 'READ',
    }

    const newStatus = statusMap[update.status] || statusMap[update.ack?.toString()]
    if (!newStatus) continue

    // Update WhatsappMessage
    const timestampField = newStatus === 'DELIVERED' ? 'deliveredAt' : 'readAt'
    await prisma.whatsappMessage.updateMany({
      where: { externalId },
      data: {
        status: newStatus,
        [timestampField]: new Date(),
      },
    })

    // Campaign correlation: update CampaignRecipient by externalMessageId
    const recipient = await prisma.campaignRecipient.findFirst({
      where: { externalMessageId: externalId },
    })

    if (recipient) {
      const recipientUpdate: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'DELIVERED') recipientUpdate.deliveredAt = new Date()
      if (newStatus === 'READ') recipientUpdate.readAt = new Date()

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: recipientUpdate,
      })

      // Update campaign stats
      const campaign = await prisma.campaign.findFirst({
        where: { id: recipient.campaignId },
        select: { id: true, stats: true },
      })

      if (campaign) {
        const stats = (campaign.stats as Record<string, number>) || {}
        const field = newStatus === 'DELIVERED' ? 'delivered' : 'read'
        stats[field] = (stats[field] || 0) + 1

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { stats },
        })
      }

      // Log campaign event
      await prisma.campaignEvent.create({
        data: {
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          contactId: recipient.contactId,
          eventType: newStatus === 'DELIVERED' ? 'delivered' : 'read',
          metadata: { externalId },
        },
      })
    }
  }
}

/**
 * Correlate an inbound reply to an active campaign recipient.
 */
async function correlateCampaignReply(tenantId: string, phone: string): Promise<void> {
  // Normalize phone
  const digits = phone.replace(/\D/g, '')

  const recipient = await prisma.campaignRecipient.findFirst({
    where: {
      phone: digits,
      status: { in: ['SENT', 'DELIVERED', 'READ'] },
      campaign: {
        tenantId,
        type: 'whatsapp',
        status: { in: ['SENDING', 'PAUSED', 'COMPLETED'] },
      },
    },
    orderBy: { lastSentAt: 'desc' }, // Most recent campaign first
  })

  if (recipient) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'REPLIED', repliedAt: new Date() },
    })

    // Update campaign stats
    const campaign = await prisma.campaign.findFirst({
      where: { id: recipient.campaignId },
      select: { id: true, stats: true },
    })
    if (campaign) {
      const stats = (campaign.stats as Record<string, number>) || {}
      stats.replied = (stats.replied || 0) + 1
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { stats },
      })
    }

    await prisma.campaignEvent.create({
      data: {
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        contactId: recipient.contactId,
        eventType: 'replied',
        metadata: { phone: digits },
      },
    })
  }
}

export { evolutionWebhook }
