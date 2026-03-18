/**
 * BullMQ Workers — Process background jobs.
 *
 * Started separately: `npx tsx src/jobs/workers.ts`
 * Or inline with Hub when REDIS_URL is set.
 *
 * Workers:
 * - campaign-worker: Sends emails/DMs/WhatsApp per campaign step
 * - scrape-worker: Monitors Apify runs and ingests results
 * - publish-worker: Publishes social media posts via getLate
 */

import { prisma } from '../lib/prisma.js'
import { routeService } from '../router/service-router.js'
import { logger } from '../lib/logger.js'
import type { CampaignJobData, ScrapeJobData, PublishJobData } from './queue.js'

/**
 * Start all workers. Call this when Redis is available.
 */
export async function startWorkers(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.warn('REDIS_URL not set — workers not started')
    return
  }

  try {
    const { Worker } = await import('bullmq')
    const connection = { url: redisUrl }

    // ═══ Campaign Worker ═══
    new Worker('solti-campaigns', async (job) => {
      const data = job.data as CampaignJobData
      logger.info({ jobId: job.id, campaignId: data.campaignId, step: data.stepNumber }, 'Processing campaign step')

      try {
        switch (data.channel) {
          case 'email':
            await routeService({
              tenantId: data.tenantId,
              service: 'brevo',
              action: 'send_email',
              params: {
                to: data.contactEmail,
                subject: data.subject || 'Sin asunto',
                html: data.body,
                tags: [`campaign:${data.campaignId}`],
              },
            })
            break

          case 'whatsapp':
            await routeService({
              tenantId: data.tenantId,
              service: 'evolution',
              action: 'send_text',
              params: {
                instanceName: `solti-${data.tenantId}`,
                number: data.contactPhone,
                text: data.body,
              },
            })
            break

          case 'instagram_dm':
            await routeService({
              tenantId: data.tenantId,
              service: 'apify',
              action: 'send_instagram_dm',
              params: {
                usernames: [data.contactPhone], // contactPhone repurposed for IG username
                message: data.body,
              },
            })
            break

          case 'linkedin_dm':
            // LinkedIn DM via PhantomBuster or manual queue
            // For now, log as activity for manual follow-up
            logger.info({ recipientId: data.recipientId }, 'LinkedIn DM queued for manual send')
            const linkedinRecipient = await prisma.campaignRecipient.findUnique({
              where: { id: data.recipientId },
              select: { contactId: true },
            })
            await prisma.activity.create({
              data: {
                tenantId: data.tenantId,
                contactId: linkedinRecipient?.contactId || null,
                type: 'dm_sent',
                title: data.subject || 'LinkedIn DM',
                description: data.body,
                metadata: { campaignId: data.campaignId, stepNumber: data.stepNumber, manual: true },
              },
            })
            break

          default:
            logger.warn({ channel: data.channel }, 'Unsupported campaign channel')
        }

        // Update recipient
        await prisma.campaignRecipient.update({
          where: { id: data.recipientId },
          data: {
            currentStep: data.stepNumber,
            status: 'SENT',
            lastSentAt: new Date(),
          },
        })

        // Create campaign event (resolve contactId from recipient)
        const recipient = await prisma.campaignRecipient.findUnique({
          where: { id: data.recipientId },
          select: { contactId: true },
        })
        await prisma.campaignEvent.create({
          data: {
            campaignId: data.campaignId,
            recipientId: data.recipientId,
            contactId: recipient?.contactId || '',
            stepNumber: data.stepNumber,
            eventType: 'sent',
          },
        })
      } catch (err: any) {
        logger.error({ err, campaignId: data.campaignId }, 'Campaign step failed')
        await prisma.campaignRecipient.update({
          where: { id: data.recipientId },
          data: { status: 'FAILED' },
        })
        throw err // Let BullMQ retry
      }
    }, { connection, concurrency: 5 })

    // ═══ Scrape Worker ═══
    new Worker('solti-scraping', async (job) => {
      const data = job.data as ScrapeJobData
      logger.info({ jobId: job.id, platform: data.platform }, 'Processing scrape job')

      // Check Apify run status
      const statusResult = await routeService({
        tenantId: data.tenantId,
        service: 'apify',
        action: 'get_run_status',
        params: { runId: (await prisma.job.findUnique({ where: { id: data.jobId } }))?.externalId },
      })

      const apifyStatus = (statusResult.data as any)?.status

      if (apifyStatus === 'SUCCEEDED') {
        // Fetch results
        const resultsResult = await routeService({
          tenantId: data.tenantId,
          service: 'apify',
          action: 'get_run_results',
          params: { runId: (await prisma.job.findUnique({ where: { id: data.jobId } }))?.externalId },
        })

        if (resultsResult.success && Array.isArray(resultsResult.data)) {
          const items = resultsResult.data as any[]

          // Store raw results
          await prisma.scrapeResult.createMany({
            data: items.map(item => ({
              jobId: data.jobId,
              tenantId: data.tenantId,
              platform: data.platform,
              rawData: item,
            })),
          })

          // Update job
          await prisma.job.update({
            where: { id: data.jobId },
            data: {
              status: 'COMPLETED',
              progress: 100,
              completedAt: new Date(),
              output: { resultCount: items.length },
            },
          })

          logger.info({ jobId: data.jobId, results: items.length }, 'Scrape job completed')
        }
      } else if (apifyStatus === 'FAILED' || apifyStatus === 'ABORTED') {
        await prisma.job.update({
          where: { id: data.jobId },
          data: { status: 'FAILED', error: `Apify: ${apifyStatus}` },
        })
      }
      // If still running, the job will be retried
    }, { connection, concurrency: 3 })

    // ═══ Publish Worker ═══
    new Worker('solti-publishing', async (job) => {
      const data = job.data as PublishJobData
      logger.info({ jobId: job.id, platform: data.platform }, 'Processing publish job')

      try {
        const result = await routeService({
          tenantId: data.tenantId,
          service: 'getlate',
          action: 'create_post',
          params: {
            content: data.content,
            platforms: [data.platform],
            mediaUrls: data.mediaUrls,
          },
        })

        await prisma.contentPost.update({
          where: { id: data.postId },
          data: {
            status: result.success ? 'PUBLISHED' : 'FAILED',
            publishedAt: result.success ? new Date() : undefined,
            externalId: result.success ? (result.data as any)?.id : null,
          },
        })
      } catch (err: any) {
        await prisma.contentPost.update({
          where: { id: data.postId },
          data: { status: 'FAILED' },
        })
        throw err
      }
    }, { connection, concurrency: 2 })

    logger.info('All BullMQ workers started (campaigns, scraping, publishing)')
  } catch (err) {
    logger.error({ err }, 'Failed to start workers')
  }

  // Start WhatsApp-specific workers
  try {
    const { startWhatsappWorker } = await import('./whatsapp.worker.js')
    await startWhatsappWorker()
    const { startAutoReplyWorker } = await import('./autoreply.worker.js')
    await startAutoReplyWorker()
  } catch (err) {
    logger.error({ err }, 'Failed to start WhatsApp workers')
  }
}

// Run standalone if executed directly
if (process.argv[1]?.includes('workers')) {
  startWorkers()
}
