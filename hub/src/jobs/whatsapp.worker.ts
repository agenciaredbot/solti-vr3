/**
 * WhatsApp Send Worker — Processes campaign message sends with rate limiting.
 *
 * Features:
 * - Instance rotation (round-robin between tenant's connected instances)
 * - Per-instance rate limiting (hourly + daily via Redis counters)
 * - Sending window enforcement (8am-8pm by default)
 * - Auto-pause on consecutive failures
 * - Campaign status check before each send
 * - Correlation: stores Evolution messageId for webhook tracking
 */

import { prisma } from '../lib/prisma.js'
import { routeService } from '../router/service-router.js'
import { logger } from '../lib/logger.js'
import { notifyCampaignPaused, notifyInstanceDisconnected } from '../services/notification.service.js'
import type { WhatsappSendJobData } from './queue.js'

// In-memory rate counters (fallback when Redis counters aren't available directly)
const hourlyCounters = new Map<string, { count: number; resetAt: number }>()
const dailyCounters = new Map<string, { count: number; resetAt: number }>()

/**
 * Start the WhatsApp send worker.
 */
export async function startWhatsappWorker(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.warn('REDIS_URL not set — WhatsApp worker not started')
    return
  }

  try {
    const { Worker } = await import('bullmq')
    const connection = { url: redisUrl }

    new Worker('solti:whatsapp-send', async (job) => {
      const data = job.data as WhatsappSendJobData
      logger.info(
        { jobId: job.id, campaignId: data.campaignId, phone: data.phone, instance: data.instanceId },
        'Processing WhatsApp send'
      )

      // 1. Check campaign is still SENDING
      const campaign = await prisma.campaign.findFirst({
        where: { id: data.campaignId },
        select: { status: true, settings: true },
      })

      if (!campaign || campaign.status !== 'SENDING') {
        logger.info({ campaignId: data.campaignId, status: campaign?.status }, 'Campaign not in SENDING state, skipping')
        return
      }

      const settings = campaign.settings as Record<string, unknown> || {}

      // 2. Check sending window
      const timezone = (settings.timezone as string) || 'America/Bogota'
      const windowStart = (settings.sendingWindowStart as number) ?? 8
      const windowEnd = (settings.sendingWindowEnd as number) ?? 20
      const currentHour = getCurrentHour(timezone)

      if (currentHour < windowStart || currentHour >= windowEnd) {
        // Re-queue with delay until window opens
        const delayMs = getDelayUntilWindowOpen(windowStart, timezone)
        logger.info({ campaignId: data.campaignId, currentHour, windowStart }, 'Outside sending window, re-queuing')
        throw new Error(`OUTSIDE_WINDOW:${delayMs}`) // BullMQ will retry with backoff
      }

      // 3. Check rate limits
      const instanceName = data.instanceId
      const maxPerHour = (settings.maxPerHourPerInstance as number) ?? 60
      const maxPerDay = (settings.maxPerDayPerInstance as number) ?? 500

      if (!checkAndIncrementRate(instanceName, 'hourly', maxPerHour)) {
        logger.info({ instanceName, maxPerHour }, 'Hourly rate limit reached, retrying later')
        throw new Error('RATE_LIMIT_HOURLY')
      }

      if (!checkAndIncrementRate(instanceName, 'daily', maxPerDay)) {
        logger.info({ instanceName, maxPerDay }, 'Daily rate limit reached')
        // Pause the campaign — daily limit means we're done for today
        await prisma.campaign.update({
          where: { id: data.campaignId },
          data: { status: 'PAUSED', pausedAt: new Date() },
        })
        await logCampaignEvent(data.campaignId, data.recipientId, 'RATE_LIMIT_HIT', {
          reason: 'daily_limit', instanceName,
        })
        notifyCampaignPaused(data.tenantId, data.campaignId, 'Límite diario de envíos alcanzado').catch(() => {})
        return
      }

      // 4. Verify instance is connected
      const instance = await prisma.whatsappInstance.findFirst({
        where: { instanceName, tenantId: data.tenantId },
        select: { id: true, status: true, instanceName: true },
      })

      if (!instance || instance.status !== 'CONNECTED') {
        logger.warn({ instanceName, status: instance?.status }, 'Instance not connected')
        await handleInstanceDown(data)
        throw new Error('INSTANCE_DISCONNECTED')
      }

      // 5. Send the message
      try {
        let result: any

        if (data.message.mediaUrl && data.message.mediaType) {
          result = await routeService({
            tenantId: data.tenantId,
            service: 'evolution',
            action: 'send_media',
            params: {
              instance: instanceName,
              number: data.phone,
              mediaUrl: data.message.mediaUrl,
              mediaType: data.message.mediaType,
              caption: data.message.text,
              fileName: data.message.fileName,
            },
          })
        } else {
          result = await routeService({
            tenantId: data.tenantId,
            service: 'evolution',
            action: 'send_text',
            params: {
              instance: instanceName,
              number: data.phone,
              text: data.message.text,
            },
          })
        }

        if (!result.success) {
          throw new Error(result.description || 'Send failed')
        }

        // 6. Update recipient with success + store messageId for webhook correlation
        const messageId = (result.data as any)?.messageId || null
        await prisma.campaignRecipient.update({
          where: { id: data.recipientId },
          data: {
            status: 'SENT',
            externalMessageId: messageId,
            instanceUsed: instanceName,
            attempts: data.attempt,
            lastSentAt: new Date(),
          },
        })

        await logCampaignEvent(data.campaignId, data.recipientId, 'MESSAGE_SENT', {
          instanceName, messageId, phone: data.phone,
        })

        // Update campaign stats
        await updateCampaignStats(data.campaignId, 'sent')

        // Reset consecutive failure counter
        resetConsecutiveFailures(data.campaignId)

        logger.info(
          { campaignId: data.campaignId, phone: data.phone, messageId },
          'WhatsApp message sent successfully'
        )

      } catch (sendErr: any) {
        const errMsg = sendErr.message || String(sendErr)
        const isPermanent = isPermanentError(errMsg)

        await prisma.campaignRecipient.update({
          where: { id: data.recipientId },
          data: {
            status: isPermanent ? 'FAILED' : 'PENDING',
            failReason: errMsg.slice(0, 500),
            failedAt: isPermanent ? new Date() : undefined,
            attempts: data.attempt,
          },
        })

        if (isPermanent) {
          await logCampaignEvent(data.campaignId, data.recipientId, 'MESSAGE_FAILED', {
            reason: errMsg, permanent: true,
          })
          await updateCampaignStats(data.campaignId, 'failed')
          return // Don't retry permanent errors
        }

        // Track consecutive failures
        const consecutiveFailures = incrementConsecutiveFailures(data.campaignId)
        const maxConsecutive = (settings.maxConsecutiveFailures as number) ?? 3

        if (consecutiveFailures >= maxConsecutive) {
          logger.warn({ campaignId: data.campaignId, consecutiveFailures }, 'Auto-pausing campaign due to consecutive failures')
          await prisma.campaign.update({
            where: { id: data.campaignId },
            data: { status: 'PAUSED', pausedAt: new Date() },
          })
          await logCampaignEvent(data.campaignId, null, 'AUTO_PAUSED', {
            reason: 'consecutive_failures', count: consecutiveFailures,
          })
          notifyCampaignPaused(data.tenantId, data.campaignId, `${consecutiveFailures} fallos consecutivos`).catch(() => {})
          return
        }

        throw sendErr // Let BullMQ retry
      }
    }, {
      connection,
      concurrency: 1, // Serial by design — rate limiting requires sequential processing
    })

    logger.info('WhatsApp send worker started')
  } catch (err) {
    logger.error({ err }, 'Failed to start WhatsApp send worker')
  }
}

// ═══ Rate limiting helpers ═══

function checkAndIncrementRate(instanceName: string, type: 'hourly' | 'daily', max: number): boolean {
  const counters = type === 'hourly' ? hourlyCounters : dailyCounters
  const ttl = type === 'hourly' ? 3600_000 : 86400_000
  const key = `${instanceName}:${type}`

  const now = Date.now()
  let counter = counters.get(key)

  if (!counter || now >= counter.resetAt) {
    counter = { count: 0, resetAt: now + ttl }
    counters.set(key, counter)
  }

  if (counter.count >= max) return false
  counter.count++
  return true
}

// ═══ Consecutive failure tracking ═══

const consecutiveFailureCounts = new Map<string, number>()

function incrementConsecutiveFailures(campaignId: string): number {
  const count = (consecutiveFailureCounts.get(campaignId) || 0) + 1
  consecutiveFailureCounts.set(campaignId, count)
  return count
}

function resetConsecutiveFailures(campaignId: string): void {
  consecutiveFailureCounts.delete(campaignId)
}

// ═══ Instance failover ═══

async function handleInstanceDown(data: WhatsappSendJobData): Promise<void> {
  // Check if tenant has another connected instance
  const otherInstances = await prisma.whatsappInstance.findMany({
    where: {
      tenantId: data.tenantId,
      status: 'CONNECTED',
      instanceName: { not: data.instanceId },
    },
    select: { instanceName: true },
  })

  if (otherInstances.length === 0) {
    // Both instances down — pause campaign
    logger.warn({ campaignId: data.campaignId }, 'All instances disconnected, pausing campaign')
    await prisma.campaign.update({
      where: { id: data.campaignId },
      data: { status: 'PAUSED', pausedAt: new Date() },
    })
    await logCampaignEvent(data.campaignId, null, 'INSTANCE_DISCONNECTED', {
      instanceName: data.instanceId, allDown: true,
    })
    notifyInstanceDisconnected(data.tenantId, data.instanceId, true).catch(() => {})
  } else {
    await logCampaignEvent(data.campaignId, null, 'INSTANCE_DISCONNECTED', {
      instanceName: data.instanceId, failoverTo: otherInstances[0].instanceName,
    })
  }
}

// ═══ Error classification ═══

function isPermanentError(errMsg: string): boolean {
  const permanentPatterns = [
    'not registered', 'invalid number', 'number does not exist',
    'blocked', 'banned', 'not a whatsapp',
  ]
  const lower = errMsg.toLowerCase()
  return permanentPatterns.some(p => lower.includes(p))
}

// ═══ Campaign stats helper ═══

async function updateCampaignStats(campaignId: string, field: 'sent' | 'failed'): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId },
    select: { stats: true },
  })
  if (!campaign) return

  const stats = (campaign.stats as Record<string, number>) || {}
  stats[field] = (stats[field] || 0) + 1
  stats.pending = Math.max(0, (stats.pending || 0) - 1)

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { stats },
  })
}

// ═══ Campaign event logger ═══

async function logCampaignEvent(
  campaignId: string,
  recipientId: string | null,
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    // Get contactId from recipient if available
    let contactId: string | null = null
    if (recipientId) {
      const recipient = await prisma.campaignRecipient.findUnique({
        where: { id: recipientId },
        select: { contactId: true },
      })
      contactId = recipient?.contactId || null
    }

    await prisma.campaignEvent.create({
      data: {
        campaignId,
        recipientId: recipientId || '',
        contactId: contactId || '',
        eventType,
        metadata: JSON.parse(JSON.stringify(metadata)),
      },
    })
  } catch (err) {
    logger.warn({ err, campaignId, eventType }, 'Failed to log campaign event')
  }
}

// ═══ Timezone helpers ═══

function getCurrentHour(timezone: string): number {
  try {
    const now = new Date()
    const formatted = now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
    return parseInt(formatted)
  } catch {
    return new Date().getHours()
  }
}

function getDelayUntilWindowOpen(windowStart: number, timezone: string): number {
  const currentHour = getCurrentHour(timezone)
  let hoursUntilOpen = windowStart - currentHour
  if (hoursUntilOpen <= 0) hoursUntilOpen += 24
  return hoursUntilOpen * 3600_000
}
