/**
 * Auto-Reply Worker — AI-powered responses via Claude Haiku.
 *
 * When enabled on a WhatsApp instance, incoming messages trigger:
 * 1. Load conversation history (last N messages)
 * 2. Load system prompt from instance config
 * 3. Call Claude Haiku API
 * 4. Send response via Evolution API
 * 5. Store as WhatsappMessage (isAutoReply = true)
 *
 * Protections:
 * - Cooldown between auto-replies to same contact
 * - Blacklist check
 * - Fallback message on API failure
 * - Kill switch via autoReply = false
 */

import { prisma } from '../lib/prisma.js'
import { routeService } from '../router/service-router.js'
import { logger } from '../lib/logger.js'
import type { AutoReplyJobData } from './queue.js'

// Cooldown tracker: contactPhone → lastReplyTimestamp
const cooldowns = new Map<string, number>()

export async function startAutoReplyWorker(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.warn('REDIS_URL not set — Auto-reply worker not started')
    return
  }

  try {
    const { Worker } = await import('bullmq')
    const connection = { url: redisUrl }

    new Worker('solti:whatsapp-autoreply', async (job) => {
      const data = job.data as AutoReplyJobData
      logger.info(
        { jobId: job.id, instanceId: data.instanceId, phone: data.contactPhone },
        'Processing auto-reply'
      )

      // 1. Load instance config
      const instance = await prisma.whatsappInstance.findFirst({
        where: { id: data.instanceId },
        select: {
          id: true,
          instanceName: true,
          autoReply: true,
          systemPrompt: true,
          additionalContext: true,
          maxHistoryMsgs: true,
          maxTokens: true,
          fallbackMsg: true,
          cooldownSecs: true,
          tenantId: true,
        },
      })

      if (!instance || !instance.autoReply) {
        logger.info({ instanceId: data.instanceId }, 'Auto-reply disabled, skipping')
        return
      }

      // 2. Check cooldown
      const cooldownKey = `${data.instanceId}:${data.contactPhone}`
      const lastReply = cooldowns.get(cooldownKey) || 0
      const cooldownMs = (instance.cooldownSecs || 60) * 1000
      const now = Date.now()

      if (now - lastReply < cooldownMs) {
        logger.info({ phone: data.contactPhone, cooldownSecs: instance.cooldownSecs }, 'Auto-reply cooldown active, skipping')
        return
      }

      // 3. Check blacklist
      const blacklisted = await prisma.whatsappBlacklist.findFirst({
        where: {
          tenantId: instance.tenantId,
          phone: data.contactPhone,
        },
      })
      if (blacklisted) {
        logger.info({ phone: data.contactPhone }, 'Contact blacklisted, skipping auto-reply')
        return
      }

      // 4. Load conversation history
      const recentMessages = await prisma.whatsappMessage.findMany({
        where: { conversationId: data.conversationId },
        orderBy: { createdAt: 'desc' },
        take: instance.maxHistoryMsgs || 10,
        select: {
          direction: true,
          content: true,
          createdAt: true,
        },
      })

      // Reverse to chronological order
      const history = recentMessages.reverse()

      // 5. Generate reply via Claude Haiku
      let replyText: string

      try {
        let fullPrompt = instance.systemPrompt || getDefaultSystemPrompt()
        if (instance.additionalContext) {
          fullPrompt += '\n\n--- INFORMACION ADICIONAL ---\n' + instance.additionalContext
        }
        replyText = await generateReply(
          fullPrompt,
          history,
          instance.maxTokens || 500,
          instance.tenantId
        )
      } catch (err) {
        logger.warn({ err, instanceId: data.instanceId }, 'Claude API failed, using fallback')
        replyText = instance.fallbackMsg || 'Gracias por tu mensaje. Un asesor te contactará pronto.'
      }

      if (!replyText) return

      // 6. Send reply via Evolution
      try {
        await routeService({
          tenantId: instance.tenantId,
          service: 'evolution',
          action: 'send_text',
          params: {
            instance: instance.instanceName,
            number: data.contactPhone,
            text: replyText,
          },
        })

        // 7. Store message
        await prisma.whatsappMessage.create({
          data: {
            conversationId: data.conversationId,
            direction: 'OUTBOUND',
            messageType: 'text',
            content: replyText,
            status: 'SENT',
            isAutoReply: true,
            isAiGenerated: true,
            sentAt: new Date(),
          },
        })

        // Update cooldown
        cooldowns.set(cooldownKey, Date.now())

        logger.info(
          { instanceId: data.instanceId, phone: data.contactPhone, replyLength: replyText.length },
          'Auto-reply sent'
        )
      } catch (sendErr) {
        logger.error({ sendErr, instanceId: data.instanceId }, 'Failed to send auto-reply')
      }
    }, {
      connection,
      concurrency: 3,
    })

    logger.info('Auto-reply worker started')
  } catch (err) {
    logger.error({ err }, 'Failed to start auto-reply worker')
  }
}

/**
 * Generate a reply using Claude Haiku API.
 */
async function generateReply(
  systemPrompt: string,
  history: Array<{ direction: string; content: string | null; createdAt: Date }>,
  maxTokens: number,
  tenantId: string
): Promise<string> {
  // Get Anthropic API key from tenant credentials or env
  const apiKey = await getAnthropicKey(tenantId)
  if (!apiKey) {
    throw new Error('No Anthropic API key configured')
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
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error: ${response.status} ${err.slice(0, 200)}`)
  }

  const data = await response.json() as any
  return data.content?.[0]?.text || ''
}

/**
 * Get Anthropic API key — from tenant credentials or platform env.
 */
async function getAnthropicKey(tenantId: string): Promise<string | null> {
  // First check tenant's own key
  const cred = await prisma.tenantCredential.findFirst({
    where: { tenantId, service: 'anthropic' },
    select: { encryptedValue: true },
  })

  if (cred) {
    try {
      const { decrypt } = await import('../lib/crypto.js')
      return decrypt(cred.encryptedValue, tenantId)
    } catch {
      // Fall through to env
    }
  }

  // Fallback to platform key
  return process.env.ANTHROPIC_API_KEY || null
}

function getDefaultSystemPrompt(): string {
  return `Eres un asistente virtual amigable y profesional.
Responde de manera concisa y útil.
Si no sabes la respuesta, di que un asesor se pondrá en contacto.
No inventes información sobre precios o disponibilidad.
Mantén las respuestas cortas (máximo 2-3 párrafos).
Responde en el mismo idioma que el cliente.`
}
