/**
 * Cron: Poll WhatsApp messages from Evolution API
 *
 * Runs every minute via Vercel Cron to work around Evolution webhook bug
 * where inbound messages don't trigger webhooks.
 *
 * GET /api/cron/poll-messages
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findMessages, sendText } from '@/lib/evolution'

// Vercel Cron protection
export async function GET(req: NextRequest) {
  // Verify it's from Vercel Cron or has the secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await pollMessages()
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[Poller] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function pollMessages() {
  // Find all connected instances with autoReply enabled
  const instances = await prisma.whatsappInstance.findMany({
    where: {
      status: 'CONNECTED',
      autoReply: true,
    },
    select: {
      id: true,
      tenantId: true,
      instanceName: true,
      systemPrompt: true,
      additionalContext: true,
      maxHistoryMsgs: true,
      maxTokens: true,
      fallbackMsg: true,
      cooldownSecs: true,
    },
  })

  if (instances.length === 0) {
    return { processed: 0, message: 'No active instances' }
  }

  let totalProcessed = 0

  for (const instance of instances) {
    try {
      const processed = await pollInstance(instance)
      totalProcessed += processed
    } catch (err) {
      console.error(`[Poller] Error polling ${instance.instanceName}:`, err)
    }
  }

  return { processed: totalProcessed, instances: instances.length }
}

async function pollInstance(instance: {
  id: string
  tenantId: string
  instanceName: string
  systemPrompt: string | null
  additionalContext: string | null
  maxHistoryMsgs: number | null
  maxTokens: number | null
  fallbackMsg: string | null
  cooldownSecs: number | null
}): Promise<number> {
  // Fetch recent inbound messages from Evolution
  let evoMessages: any[]
  try {
    const result = await findMessages(instance.instanceName, { fromMe: false, limit: 20 })
    const data = result.messages || result
    evoMessages = Array.isArray(data) ? data : (data.records || [])
  } catch (err) {
    console.error(`[Poller] Failed to fetch messages for ${instance.instanceName}:`, err)
    return 0
  }

  let processed = 0

  for (const msg of evoMessages) {
    const key = msg.key || {}
    const externalId = key.id || msg.id
    const remoteJid = key.remoteJid || ''
    const fromMe = key.fromMe || false

    // Skip outbound, groups, status
    if (fromMe) continue
    if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') continue
    if (!externalId) continue

    // Idempotency — already processed?
    const exists = await prisma.whatsappMessage.findFirst({
      where: { externalId: String(externalId) },
    })
    if (exists) continue

    // Check message age — skip if older than 2 minutes
    const msgTimestamp = msg.messageTimestamp || 0
    const msgAge = Date.now() / 1000 - msgTimestamp
    if (msgAge > 120) continue // Skip old messages

    const messageContent = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || ''
    const pushName = msg.pushName || ''
    const phone = remoteJid.replace('@s.whatsapp.net', '')

    console.log(`[Poller] New inbound: ${phone} | ${messageContent.slice(0, 50)}`)

    // Find or create conversation
    let conversation = await prisma.whatsappConversation.findFirst({
      where: { instanceId: instance.id, remoteJid },
    })

    if (!conversation) {
      const contact = await prisma.contact.findFirst({
        where: { tenantId: instance.tenantId, phone },
        select: { id: true },
      })

      conversation = await prisma.whatsappConversation.create({
        data: {
          tenantId: instance.tenantId,
          instanceId: instance.id,
          remoteJid,
          remoteName: pushName || phone,
          contactId: contact?.id || null,
          status: 'ACTIVE',
          lastMessageAt: new Date(),
        },
      })
    } else {
      await prisma.whatsappConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          remoteName: pushName || conversation.remoteName,
          unreadCount: { increment: 1 },
        },
      })
    }

    // Store message
    await prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        messageType: 'text',
        content: messageContent || null,
        status: 'DELIVERED',
        externalId: String(externalId),
        sentAt: new Date(),
      },
    })

    processed++

    // Auto-reply if there's content
    if (messageContent && instance.systemPrompt) {
      await processAutoReply(instance, conversation.id, phone, messageContent)
    }
  }

  return processed
}

// ══════ Auto-Reply ══════

async function processAutoReply(
  instance: {
    id: string
    tenantId: string
    instanceName: string
    systemPrompt: string | null
    additionalContext: string | null
    maxHistoryMsgs: number | null
    maxTokens: number | null
    fallbackMsg: string | null
  },
  conversationId: string,
  phone: string,
  inboundMessage: string
) {
  // Check blacklist
  const blacklisted = await prisma.whatsappBlacklist.findFirst({
    where: { tenantId: instance.tenantId, phone },
  })
  if (blacklisted) return

  // Load history
  const recentMessages = await prisma.whatsappMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: instance.maxHistoryMsgs || 10,
    select: { direction: true, content: true },
  })

  const history = recentMessages.reverse()

  // Generate reply
  let replyText: string
  try {
    replyText = await generateReply(
      instance.systemPrompt || '',
      instance.additionalContext,
      history,
      instance.maxTokens || 500,
      instance.tenantId
    )
  } catch (err) {
    console.error(`[Poller AutoReply] Claude failed:`, err)
    replyText = instance.fallbackMsg || 'Gracias por tu mensaje. Un asesor te contactara pronto.'
  }

  if (!replyText) return

  try {
    await sendText(instance.instanceName, phone, replyText)

    await prisma.whatsappMessage.create({
      data: {
        conversationId,
        direction: 'OUTBOUND',
        messageType: 'text',
        content: replyText,
        status: 'SENT',
        isAutoReply: true,
        isAiGenerated: true,
        sentAt: new Date(),
      },
    })

    console.log(`[Poller AutoReply] Sent to ${phone}: ${replyText.slice(0, 50)}...`)
  } catch (err) {
    console.error(`[Poller AutoReply] Send failed:`, err)
  }
}

async function generateReply(
  systemPrompt: string,
  additionalContext: string | null,
  history: Array<{ direction: string; content: string | null }>,
  maxTokens: number,
  tenantId: string
): Promise<string> {
  const apiKey = await getAnthropicKey(tenantId)
  if (!apiKey) throw new Error('No Anthropic API key')

  let fullPrompt = systemPrompt
  if (additionalContext) {
    fullPrompt += '\n\n--- INFORMACION ADICIONAL ---\n' + additionalContext
  }

  const messages = history
    .filter(m => m.content)
    .map(m => ({
      role: m.direction === 'INBOUND' ? 'user' as const : 'assistant' as const,
      content: m.content!,
    }))

  if (messages.length === 0) return ''

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: fullPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API: ${response.status} ${err.slice(0, 200)}`)
  }

  const data = await response.json() as any
  return data.content?.[0]?.text || ''
}

async function getAnthropicKey(tenantId: string): Promise<string | null> {
  const cred = await prisma.tenantCredential.findFirst({
    where: { tenantId, service: 'anthropic' },
    select: { encryptedValue: true },
  })

  if (cred) {
    try {
      const { createDecipheriv } = await import('crypto')
      const secret = process.env.ENCRYPTION_SECRET || 'solti-default-secret-change-me-in-prod'
      const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32))
      const combined = Buffer.from(cred.encryptedValue, 'base64')
      const iv = combined.subarray(0, 16)
      const tag = combined.subarray(16, 32)
      const encrypted = combined.subarray(32)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
    } catch { /* fall through */ }
  }

  return process.env.ANTHROPIC_API_KEY || null
}
