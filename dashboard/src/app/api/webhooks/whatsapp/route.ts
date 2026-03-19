/**
 * WhatsApp Webhook — Receives events from Evolution API.
 *
 * POST /api/webhooks/whatsapp
 *
 * Processes incoming messages and triggers auto-reply INLINE
 * (no Redis, no BullMQ — runs in the same serverless function).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendText } from '@/lib/evolution'

// Normalize event names: MESSAGES_UPSERT → messages.upsert, messages.upsert → messages.upsert
function normalizeEvent(raw: string): string {
  if (raw.includes('.')) return raw.toLowerCase()
  return raw.toLowerCase().replace(/_/g, '.').replace(/^([a-z]+)\./, '$1.')
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const rawEvent = body.event || ''
  const event = normalizeEvent(rawEvent)
  const instanceName = body.instance || body.data?.instance || ''
  const data = body.data || {}

  console.log(`[Webhook] ${rawEvent} → ${event} | instance: ${instanceName}`)

  // Only process our instances
  if (!instanceName.startsWith('solti-')) {
    return NextResponse.json({ ok: true })
  }

  try {
    // Buffer raw event
    await prisma.webhookEvent.create({
      data: {
        source: 'evolution',
        event: rawEvent,
        instanceName,
        payload: JSON.parse(JSON.stringify(body)),
        processed: false,
      },
    }).catch(() => {}) // Non-critical

    switch (event) {
      case 'messages.upsert':
      case 'send.message':
        await handleMessage(instanceName, data)
        break
      case 'connection.update':
        await handleConnectionUpdate(instanceName, data)
        break
      case 'qrcode.updated':
        await handleQrUpdate(instanceName, data)
        break
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event}:`, err)
  }

  return NextResponse.json({ ok: true })
}

// ══════ Message Handler ══════

async function handleMessage(instanceName: string, data: any) {
  const key = data.key || {}
  const remoteJid = key.remoteJid || ''
  const fromMe = key.fromMe || false
  const externalId = key.id || ''
  const pushName = data.pushName || ''
  const messageContent = data.message?.conversation
    || data.message?.extendedTextMessage?.text
    || ''
  const messageType = data.messageType || 'text'

  // Skip group messages, status broadcasts
  if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return
  if (!externalId) return

  // Find instance in DB
  const instance = await prisma.whatsappInstance.findFirst({
    where: { instanceName },
    select: {
      id: true,
      tenantId: true,
      autoReply: true,
      systemPrompt: true,
      additionalContext: true,
      maxHistoryMsgs: true,
      maxTokens: true,
      fallbackMsg: true,
      cooldownSecs: true,
    },
  })

  if (!instance) {
    console.log(`[Webhook] Instance ${instanceName} not found in DB`)
    return
  }

  // Extract phone number
  const phone = remoteJid.replace('@s.whatsapp.net', '')
  const direction = fromMe ? 'OUTBOUND' : 'INBOUND'

  // Idempotency check
  const exists = await prisma.whatsappMessage.findFirst({
    where: { externalId },
  })
  if (exists) return

  // Find or create conversation
  let conversation = await prisma.whatsappConversation.findFirst({
    where: { instanceId: instance.id, remoteJid },
  })

  if (!conversation) {
    // Try to find existing contact by phone
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
        unreadCount: direction === 'INBOUND'
          ? { increment: 1 }
          : conversation.unreadCount,
      },
    })
  }

  // Store message
  await prisma.whatsappMessage.create({
    data: {
      conversationId: conversation.id,
      direction,
      messageType,
      content: messageContent || null,
      status: direction === 'INBOUND' ? 'DELIVERED' : 'SENT',
      externalId,
      sentAt: new Date(),
    },
  })

  console.log(`[Webhook] Message stored: ${direction} from ${phone} | ${messageContent?.slice(0, 50)}`)

  // Auto-reply for inbound messages
  if (direction === 'INBOUND' && instance.autoReply && messageContent) {
    await processAutoReply(instance, conversation.id, phone, messageContent)
  }
}

// ══════ Auto-Reply (INLINE — no queue) ══════

async function processAutoReply(
  instance: {
    id: string
    tenantId: string
    systemPrompt: string | null
    additionalContext: string | null
    maxHistoryMsgs: number | null
    maxTokens: number | null
    fallbackMsg: string | null
    cooldownSecs: number | null
  },
  conversationId: string,
  phone: string,
  inboundMessage: string
) {
  console.log(`[AutoReply] Processing for ${phone}...`)

  // Check blacklist
  const blacklisted = await prisma.whatsappBlacklist.findFirst({
    where: { tenantId: instance.tenantId, phone },
  })
  if (blacklisted) {
    console.log(`[AutoReply] ${phone} blacklisted, skipping`)
    return
  }

  // Load conversation history
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
      instance.systemPrompt || getDefaultPrompt(),
      instance.additionalContext,
      history,
      instance.maxTokens || 500,
      instance.tenantId
    )
  } catch (err) {
    console.error(`[AutoReply] Claude API failed:`, err)
    replyText = instance.fallbackMsg || 'Gracias por tu mensaje. Un asesor te contactara pronto.'
  }

  if (!replyText) return

  // Find instance name for Evolution
  const inst = await prisma.whatsappInstance.findFirst({
    where: { id: instance.id },
    select: { instanceName: true },
  })

  if (!inst) return

  // Send via Evolution
  try {
    await sendText(inst.instanceName, phone, replyText)

    // Store auto-reply message
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

    console.log(`[AutoReply] Sent to ${phone}: ${replyText.slice(0, 50)}...`)
  } catch (sendErr) {
    console.error(`[AutoReply] Send failed:`, sendErr)
  }
}

// ══════ Claude API ══════

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
  // Try tenant's own key
  const cred = await prisma.tenantCredential.findFirst({
    where: { tenantId, service: 'anthropic' },
    select: { encryptedValue: true },
  })

  if (cred) {
    try {
      // Simple decrypt for Vercel (same logic as Hub)
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
    } catch {
      // Fall through
    }
  }

  return process.env.ANTHROPIC_API_KEY || null
}

function getDefaultPrompt(): string {
  return `Eres un asistente virtual amigable y profesional.
Responde de manera concisa y util.
Si no sabes la respuesta, di que un asesor se pondra en contacto.
No inventes informacion sobre precios o disponibilidad.
Manten las respuestas cortas (maximo 2-3 parrafos).
Responde en el mismo idioma que el cliente.`
}

// ══════ Connection Update ══════

async function handleConnectionUpdate(instanceName: string, data: any) {
  const state = data.state || data.instance?.state || 'unknown'
  const statusMap: Record<string, string> = {
    open: 'CONNECTED',
    close: 'DISCONNECTED',
    connecting: 'CONNECTING',
  }
  const status = statusMap[state] || 'DISCONNECTED'

  await prisma.whatsappInstance.updateMany({
    where: { instanceName },
    data: {
      status,
      ...(status === 'CONNECTED' ? { connectedAt: new Date() } : {}),
      ...(status === 'DISCONNECTED' ? { disconnectedAt: new Date() } : {}),
    },
  })

  console.log(`[Webhook] Connection update: ${instanceName} → ${status}`)
}

// ══════ QR Update ══════

async function handleQrUpdate(instanceName: string, data: any) {
  const qrCode = data.qrcode?.base64 || data.base64 || null
  if (!qrCode) return

  await prisma.whatsappInstance.updateMany({
    where: { instanceName },
    data: {
      qrCode,
      qrExpiresAt: new Date(Date.now() + 45_000),
      status: 'CONNECTING',
    },
  })
}
