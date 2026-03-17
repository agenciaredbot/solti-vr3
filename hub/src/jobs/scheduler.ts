/**
 * Campaign Step Scheduler
 *
 * Runs periodically to:
 * 1. Advance recipients to next campaign step (after delay + condition check)
 * 2. Mark completed campaigns
 * 3. Update campaign stats
 *
 * Can run as:
 * - Standalone cron: `npx tsx src/jobs/scheduler.ts`
 * - Called from Hub index at interval
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { renderTemplate } from '../lib/template.js'
import { enqueueCampaignStep } from './queue.js'

/**
 * Process all SENDING campaigns — advance to next steps.
 */
export async function processScheduledSteps(): Promise<{
  campaignsProcessed: number
  recipientsAdvanced: number
  campaignsCompleted: number
}> {
  let recipientsAdvanced = 0
  let campaignsCompleted = 0

  // Get all SENDING campaigns with steps
  const campaigns = await prisma.campaign.findMany({
    where: { status: 'SENDING' },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
    },
  })

  for (const campaign of campaigns) {
    const steps = campaign.steps
    if (steps.length < 2) {
      // Single-step campaigns — just check for completion
      await checkCampaignCompletion(campaign.id)
      continue
    }

    // For each step after the first
    for (let i = 1; i < steps.length; i++) {
      const currentStep = steps[i]
      const prevStep = steps[i - 1]

      // Find recipients stuck on previous step who are ready for next
      const eligibleRecipients = await prisma.campaignRecipient.findMany({
        where: {
          campaignId: campaign.id,
          currentStep: prevStep.stepNumber,
          status: 'SENT',
          lastSentAt: {
            // Delay check: lastSentAt + delayDays < now
            lte: new Date(Date.now() - currentStep.delayDays * 24 * 60 * 60 * 1000),
          },
        },
        include: {
          contact: true,
        },
      })

      for (const recipient of eligibleRecipients) {
        // Check condition
        const shouldAdvance = await checkStepCondition(
          currentStep.condition,
          campaign.id,
          recipient.id,
          prevStep.stepNumber,
        )

        if (!shouldAdvance) continue

        // Personalize template
        const personalizedBody = renderTemplate(currentStep.body, {
          firstName: recipient.contact.firstName,
          lastName: recipient.contact.lastName,
          email: recipient.contact.email,
          phone: recipient.contact.phone,
          whatsapp: recipient.contact.whatsapp,
          city: recipient.contact.city,
          country: recipient.contact.country,
          website: recipient.contact.website,
          customFields: recipient.contact.customFields,
          campaignName: campaign.name,
          stepNumber: currentStep.stepNumber,
        })

        const personalizedSubject = currentStep.subject
          ? renderTemplate(currentStep.subject, {
              firstName: recipient.contact.firstName,
              lastName: recipient.contact.lastName,
              company: `${recipient.contact.firstName} ${recipient.contact.lastName}`.trim(),
              campaignName: campaign.name,
            })
          : undefined

        // Enqueue or execute inline
        const jobId = await enqueueCampaignStep({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          recipientId: recipient.id,
          stepNumber: currentStep.stepNumber,
          channel: currentStep.channel,
          contactEmail: recipient.contact.email || undefined,
          contactPhone: recipient.contact.whatsapp || recipient.contact.phone || undefined,
          subject: personalizedSubject,
          body: personalizedBody,
        })

        if (!jobId) {
          // Inline execution (no Redis)
          try {
            const { routeService } = await import('../router/service-router.js')

            if (currentStep.channel === 'email' && recipient.contact.email) {
              await routeService({
                tenantId: campaign.tenantId,
                service: 'brevo',
                action: 'send_email',
                params: {
                  to: recipient.contact.email,
                  subject: personalizedSubject || 'Sin asunto',
                  html: personalizedBody,
                  tags: [`campaign:${campaign.id}`, `step:${currentStep.stepNumber}`],
                },
              })
            } else if (currentStep.channel === 'whatsapp') {
              const phone = recipient.contact.whatsapp || recipient.contact.phone
              if (phone) {
                await routeService({
                  tenantId: campaign.tenantId,
                  service: 'evolution',
                  action: 'send_text',
                  params: {
                    instanceName: `solti-${campaign.tenantId.slice(0, 8)}`,
                    number: phone,
                    text: personalizedBody,
                  },
                })
              }
            }

            await prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: {
                currentStep: currentStep.stepNumber,
                status: 'SENT',
                lastSentAt: new Date(),
              },
            })

            await prisma.campaignEvent.create({
              data: {
                campaignId: campaign.id,
                recipientId: recipient.id,
                contactId: recipient.contact.id,
                stepNumber: currentStep.stepNumber,
                eventType: 'sent',
              },
            })

            recipientsAdvanced++
          } catch (err: any) {
            logger.warn({ err: err.message, recipientId: recipient.id, step: currentStep.stepNumber }, 'Follow-up send failed')
          }
        } else {
          recipientsAdvanced++
        }
      }
    }

    // Check if campaign is complete
    const completed = await checkCampaignCompletion(campaign.id)
    if (completed) campaignsCompleted++
  }

  return {
    campaignsProcessed: campaigns.length,
    recipientsAdvanced,
    campaignsCompleted,
  }
}

/**
 * Check if a step's condition is met.
 */
async function checkStepCondition(
  condition: string,
  campaignId: string,
  recipientId: string,
  prevStepNumber: number,
): Promise<boolean> {
  switch (condition) {
    case 'always':
      return true

    case 'no_reply': {
      // Check if there's a reply event for this recipient
      const replyEvent = await prisma.campaignEvent.findFirst({
        where: {
          campaignId,
          recipientId,
          stepNumber: prevStepNumber,
          eventType: { in: ['replied', 'click'] },
        },
      })
      return !replyEvent // Send if NO reply
    }

    case 'no_open': {
      const openEvent = await prisma.campaignEvent.findFirst({
        where: {
          campaignId,
          recipientId,
          stepNumber: prevStepNumber,
          eventType: 'opened',
        },
      })
      return !openEvent // Send if NOT opened
    }

    default:
      return true
  }
}

/**
 * Check if a campaign is complete (all recipients done).
 */
async function checkCampaignCompletion(campaignId: string): Promise<boolean> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: true },
  })
  if (!campaign) return false

  const lastStep = campaign.steps.sort((a, b) => b.stepNumber - a.stepNumber)[0]
  if (!lastStep) return false

  // Count recipients still pending or on earlier steps
  const pendingCount = await prisma.campaignRecipient.count({
    where: {
      campaignId,
      OR: [
        { status: 'PENDING' },
        { currentStep: { lt: lastStep.stepNumber }, status: { not: 'FAILED' } },
      ],
    },
  })

  if (pendingCount === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    })

    // Update stats
    const stats = await computeCampaignStats(campaignId)
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { stats },
    })

    logger.info({ campaignId }, 'Campaign completed')
    return true
  }

  return false
}

/**
 * Compute campaign stats from events.
 */
async function computeCampaignStats(campaignId: string): Promise<Record<string, number>> {
  const events = await prisma.campaignEvent.findMany({
    where: { campaignId },
    select: { eventType: true },
  })

  const stats: Record<string, number> = {
    sent: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    bounced: 0,
    unsubscribed: 0,
  }

  for (const e of events) {
    const type = e.eventType.toLowerCase()
    if (type in stats) stats[type]++
    else if (type === 'click') stats.clicked++
    else if (type === 'open') stats.opened++
  }

  const totalRecipients = await prisma.campaignRecipient.count({ where: { campaignId } })
  stats.totalRecipients = totalRecipients
  stats.openRate = stats.sent > 0 ? Math.round(stats.opened / stats.sent * 100) : 0
  stats.clickRate = stats.sent > 0 ? Math.round(stats.clicked / stats.sent * 100) : 0

  return stats
}

/**
 * Update stats for all active campaigns.
 */
export async function updateAllCampaignStats(): Promise<void> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ['SENDING', 'COMPLETED'] } },
    select: { id: true },
  })

  for (const c of campaigns) {
    const stats = await computeCampaignStats(c.id)
    await prisma.campaign.update({
      where: { id: c.id },
      data: { stats },
    })
  }
}

// ═══ Interval runner ═══
let _intervalId: ReturnType<typeof setInterval> | null = null

export function startScheduler(intervalMs: number = 5 * 60 * 1000): void {
  if (_intervalId) return

  logger.info({ intervalMs }, 'Campaign scheduler started')

  // Run immediately
  processScheduledSteps()
    .then(r => logger.info(r, 'Scheduler tick'))
    .catch(e => logger.error({ err: e }, 'Scheduler error'))

  _intervalId = setInterval(async () => {
    try {
      const result = await processScheduledSteps()
      if (result.recipientsAdvanced > 0 || result.campaignsCompleted > 0) {
        logger.info(result, 'Scheduler tick')
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler error')
    }
  }, intervalMs)
}

export function stopScheduler(): void {
  if (_intervalId) {
    clearInterval(_intervalId)
    _intervalId = null
    logger.info('Campaign scheduler stopped')
  }
}

// Run standalone
if (process.argv[1]?.includes('scheduler')) {
  logger.info('Running scheduler in standalone mode (every 5 minutes)')
  startScheduler(5 * 60 * 1000)
}
