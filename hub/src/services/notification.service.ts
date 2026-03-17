/**
 * Notification Service — Shared dispatch to Telegram + Dashboard.
 *
 * Used by ALL modules (WhatsApp campaigns, scraping, email campaigns, etc.)
 * to notify tenants about important events.
 *
 * Channels:
 * - TELEGRAM: Push via Bot API (respects silent hours except CRITICAL)
 * - DASHBOARD: Persists in DB for in-app notification bell
 * - BOTH: Sends to both channels
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

type NotificationType =
  | 'CAMPAIGN_COMPLETED'
  | 'CAMPAIGN_PAUSED'
  | 'INSTANCE_DISCONNECTED'
  | 'INSTANCE_NEEDS_QR'
  | 'LEAD_REPLIED'
  | 'DAILY_REPORT'

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
type Channel = 'TELEGRAM' | 'DASHBOARD' | 'BOTH'

interface SendNotificationParams {
  tenantId: string
  type: NotificationType
  priority?: Priority
  channel?: Channel
  title: string
  body: string
  metadata?: Record<string, unknown>
  actionUrl?: string
}

/**
 * Send a notification to a tenant.
 */
export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const {
    tenantId,
    type,
    priority = 'NORMAL',
    channel = 'BOTH',
    title,
    body,
    metadata,
    actionUrl,
  } = params

  // Save to DB (always, for dashboard history)
  try {
    await prisma.notification.create({
      data: {
        tenantId,
        type,
        priority,
        channel,
        title,
        body,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        actionUrl,
      },
    })
  } catch (err) {
    logger.warn({ err, tenantId, type }, 'Failed to save notification to DB')
  }

  // Send to Telegram if channel includes it
  if (channel === 'TELEGRAM' || channel === 'BOTH') {
    await sendTelegram(tenantId, title, body, priority)
  }

  logger.info({ tenantId, type, priority, channel }, 'Notification sent')
}

/**
 * Send a Telegram message to tenant's linked chat.
 */
async function sendTelegram(
  tenantId: string,
  title: string,
  body: string,
  priority: Priority
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return

  const config = await prisma.tenantConfig.findFirst({
    where: { tenantId },
    select: {
      telegramChatId: true,
      metadata: true,
    },
  })

  if (!config?.telegramChatId) return

  // Check silent hours (skip for CRITICAL)
  if (priority !== 'CRITICAL') {
    const meta = (config.metadata as Record<string, unknown>) || {}
    const silentHours = meta.silentHours as { start?: string; end?: string; timezone?: string } | undefined
    if (silentHours && isInSilentHours(silentHours)) {
      logger.debug({ tenantId }, 'Skipping Telegram notification — silent hours')
      return
    }
  }

  const message = `*${title}*\n\n${body}`

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
        disable_notification: priority === 'LOW',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      logger.warn({ tenantId, err: err.slice(0, 200) }, 'Telegram send failed')
    }
  } catch (err) {
    logger.warn({ err, tenantId }, 'Telegram send error')
  }
}

function isInSilentHours(config: { start?: string; end?: string; timezone?: string }): boolean {
  if (!config.start || !config.end) return false

  try {
    const tz = config.timezone || 'America/Bogota'
    const now = new Date()
    const currentTime = now.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    })

    const current = currentTime.replace(':', '')
    const start = config.start.replace(':', '')
    const end = config.end.replace(':', '')

    // Handle overnight ranges (e.g., 22:00 - 07:00)
    if (start > end) {
      return current >= start || current < end
    }
    return current >= start && current < end
  } catch {
    return false
  }
}

// ═══ Convenience helpers ═══

export async function notifyCampaignCompleted(tenantId: string, campaignName: string, stats: Record<string, number>): Promise<void> {
  await sendNotification({
    tenantId,
    type: 'CAMPAIGN_COMPLETED',
    priority: 'NORMAL',
    channel: 'BOTH',
    title: 'Campaña completada',
    body: `"${campaignName}" finalizada: ${stats.sent || 0} enviados, ${stats.delivered || 0} entregados, ${stats.replied || 0} respuestas, ${stats.failed || 0} fallidos.`,
    metadata: { stats },
  })
}

export async function notifyCampaignPaused(tenantId: string, campaignName: string, reason: string): Promise<void> {
  await sendNotification({
    tenantId,
    type: 'CAMPAIGN_PAUSED',
    priority: 'HIGH',
    channel: 'BOTH',
    title: 'Campaña pausada',
    body: `"${campaignName}" fue pausada: ${reason}`,
    metadata: { reason },
  })
}

export async function notifyInstanceDisconnected(tenantId: string, instanceName: string, allDown: boolean): Promise<void> {
  await sendNotification({
    tenantId,
    type: 'INSTANCE_DISCONNECTED',
    priority: allDown ? 'CRITICAL' : 'HIGH',
    channel: 'BOTH',
    title: allDown ? 'Todas las instancias desconectadas' : 'Instancia desconectada',
    body: allDown
      ? `Todas las instancias de WhatsApp están desconectadas. Campañas activas pausadas.`
      : `Instancia "${instanceName}" desconectada. Tráfico redirigido a otra instancia.`,
    metadata: { instanceName, allDown },
  })
}

export async function notifyInstanceNeedsQR(tenantId: string, instanceName: string): Promise<void> {
  await sendNotification({
    tenantId,
    type: 'INSTANCE_NEEDS_QR',
    priority: 'HIGH',
    channel: 'BOTH',
    title: 'Instancia necesita reconexión',
    body: `"${instanceName}" necesita re-escanear el código QR. Abre el Dashboard para reconectar.`,
    metadata: { instanceName },
    actionUrl: '/whatsapp',
  })
}

export async function notifyLeadReplied(tenantId: string, contactName: string, campaignName: string, score?: number): Promise<void> {
  const isHot = score && score >= 70
  await sendNotification({
    tenantId,
    type: 'LEAD_REPLIED',
    priority: isHot ? 'HIGH' : 'NORMAL',
    channel: isHot ? 'BOTH' : 'DASHBOARD',
    title: isHot ? 'Lead caliente respondió' : 'Lead respondió',
    body: isHot
      ? `${contactName} (score ${score}) respondió a campaña "${campaignName}"`
      : `${contactName} respondió a campaña "${campaignName}"`,
    metadata: { contactName, campaignName, score },
    actionUrl: '/crm',
  })
}
