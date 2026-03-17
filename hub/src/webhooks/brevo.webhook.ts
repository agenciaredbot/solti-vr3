/**
 * Brevo Webhook Handler
 *
 * Receives email events from Brevo:
 * - delivered, opened, clicked, bounce, spam, unsubscribed, error
 *
 * Webhook URL: POST /webhooks/brevo
 * No auth — Brevo sends events directly.
 */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

const brevoWebhook = new Hono()

interface BrevoEvent {
  event: string        // delivered, opened, click, hard_bounce, soft_bounce, spam, unsubscribed, error
  email: string
  'message-id'?: string
  date?: string
  ts_event?: number
  tag?: string         // We'll use this to pass campaignId
  link?: string        // For click events
}

brevoWebhook.post('/', async (c) => {
  const body = await c.req.json() as BrevoEvent

  const { event, email } = body
  if (!event || !email) {
    return c.json({ error: 'Invalid payload' }, 400)
  }

  logger.info({ event, email, tag: body.tag }, 'Brevo webhook received')

  // Map Brevo events to our event types
  const eventMap: Record<string, string> = {
    delivered: 'delivered',
    opened: 'opened',
    click: 'clicked',
    hard_bounce: 'bounced',
    soft_bounce: 'bounced',
    spam: 'bounced',
    unsubscribed: 'unsubscribed',
    error: 'failed',
  }

  const ourEventType = eventMap[event]
  if (!ourEventType) {
    return c.json({ ok: true })
  }

  // If tag contains campaignId, link to campaign
  const campaignId = body.tag?.startsWith('campaign:') ? body.tag.split(':')[1] : null

  if (campaignId) {
    try {
      // Find recipient by email + campaign
      const recipient = await prisma.campaignRecipient.findFirst({
        where: {
          campaignId,
          contact: { email },
        },
      })

      if (recipient) {
        // Create campaign event
        await prisma.campaignEvent.create({
          data: {
            campaignId,
            recipientId: recipient.id,
            contactId: recipient.contactId,
            eventType: ourEventType,
            metadata: {
              brevoEvent: event,
              messageId: body['message-id'] || '',
              link: body.link || '',
              date: body.date || new Date().toISOString(),
            },
          },
        })

        // Update recipient status if needed
        if (ourEventType === 'bounced' || ourEventType === 'unsubscribed') {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: ourEventType === 'bounced' ? 'BOUNCED' : 'UNSUBSCRIBED' },
          })
        } else if (ourEventType === 'delivered') {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SENT' },
          })
        }

        // Update campaign stats
        const stats = await prisma.campaignEvent.groupBy({
          by: ['eventType'],
          where: { campaignId },
          _count: true,
        })

        const statsObj: Record<string, number> = {}
        for (const s of stats) {
          statsObj[s.eventType] = s._count
        }

        await prisma.campaign.update({
          where: { id: campaignId },
          data: { stats: statsObj },
        })
      }
    } catch (err) {
      logger.error({ err, campaignId, email, event }, 'Error processing Brevo campaign event')
    }
  }

  // Update daily metrics for email events
  try {
    const contact = await prisma.contact.findFirst({
      where: { email },
      select: { tenantId: true },
    })

    if (contact && (ourEventType === 'delivered' || ourEventType === 'opened')) {
      const today = new Date().toISOString().split('T')[0]
      await prisma.dailyMetric.upsert({
        where: { tenantId_date: { tenantId: contact.tenantId, date: new Date(today) } },
        create: {
          tenantId: contact.tenantId,
          date: new Date(today),
          emailsSent: ourEventType === 'delivered' ? 1 : 0,
          emailsOpened: ourEventType === 'opened' ? 1 : 0,
        },
        update: ourEventType === 'delivered'
          ? { emailsSent: { increment: 1 } }
          : { emailsOpened: { increment: 1 } },
      })
    }
  } catch {
    // Non-critical
  }

  return c.json({ ok: true })
})

export { brevoWebhook }
