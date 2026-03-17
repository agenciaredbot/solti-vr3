/**
 * Jobs API — Async job management (scraping, enrichment, etc.)
 *
 * GET    /          List jobs (paginated)
 * POST   /          Create job
 * GET    /:id       Get job with progress
 * POST   /:id/cancel Cancel job
 * GET    /:id/results  Get scrape results for job
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'
import { NotFoundError } from '../lib/errors.js'
import { routeService } from '../router/service-router.js'
import { logger } from '../lib/logger.js'
import { enqueueScrapeJob, enqueuePublishJob } from '../jobs/queue.js'

const jobs = new Hono()

const createJobSchema = z.object({
  type: z.enum(['scrape', 'enrich', 'campaign_send', 'dm_send', 'publish', 'whatsapp_deploy']),
  input: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
})

// ═══ GET / — List jobs ═══
jobs.get('/', async (c) => {
  const { tenantId } = getTenant(c)
  const page = Number(c.req.query('page') || 1)
  const limit = Math.min(Number(c.req.query('limit') || 20), 50)
  const status = c.req.query('status')
  const type = c.req.query('type')

  const where: Record<string, unknown> = { tenantId }
  if (status) where.status = status
  if (type) where.type = type

  const [list, total] = await Promise.all([
    prisma.job.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.job.count({ where: where as any }),
  ])

  return c.json({
    data: list,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
})

// ═══ POST / — Create and start job ═══
jobs.post('/', async (c) => {
  const { tenantId } = getTenant(c)
  const body = createJobSchema.parse(await c.req.json())

  const job = await prisma.job.create({
    data: {
      tenantId,
      type: body.type,
      input: body.input,
      status: 'PENDING',
    },
  })

  // For scrape jobs, kick off immediately via adapter
  if (body.type === 'scrape') {
    const input = body.input as Record<string, unknown>
    const platform = (input.platform as string) || 'google_maps'
    const action = `scrape_${platform}`

    try {
      const result = await routeService({
        tenantId,
        service: 'apify',
        action,
        params: input,
      })

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: result.success ? 'RUNNING' : 'FAILED',
          externalId: result.success ? (result.data as any)?.id : null,
          startedAt: new Date(),
          error: result.success ? null : result.description,
          realCostUsd: result.cost,
        },
      })

      logger.info({ tenantId, jobId: job.id, action }, 'Scrape job started')
    } catch (err: any) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: err.message },
      })
    }
  }

  // Enqueue other job types via BullMQ
  if (body.type === 'enrich') {
    // Enrichment runs inline — no external service needed yet
    // Mark as running, will be processed by plugin or future worker
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
    logger.info({ tenantId, jobId: job.id }, 'Enrich job started (inline)')
  } else if (body.type === 'publish') {
    const input = body.input as Record<string, unknown>
    const postId = input.postId as string
    if (postId) {
      const post = await prisma.contentPost.findFirst({ where: { id: postId, tenantId } })
      if (post) {
        const queueId = await enqueuePublishJob({
          tenantId,
          postId,
          platform: post.platform,
          content: post.content || '',
          mediaUrls: post.mediaUrls || [],
        })
        if (queueId) {
          await prisma.job.update({
            where: { id: job.id },
            data: { status: 'RUNNING', startedAt: new Date() },
          })
          logger.info({ tenantId, jobId: job.id, queueId }, 'Publish job enqueued')
        } else {
          // No Redis — execute inline
          try {
            const result = await routeService({
              tenantId,
              service: 'getlate',
              action: 'create_post',
              params: {
                content: post.content || '',
                platforms: [post.platform],
                mediaUrls: post.mediaUrls || [],
              },
            })
            await prisma.job.update({
              where: { id: job.id },
              data: {
                status: result.success ? 'COMPLETED' : 'FAILED',
                completedAt: new Date(),
                output: result.data as any,
              },
            })
            if (result.success) {
              await prisma.contentPost.update({
                where: { id: postId },
                data: { status: 'PUBLISHED', publishedAt: new Date(), externalId: (result.data as any)?.id },
              })
            }
          } catch (err: any) {
            await prisma.job.update({
              where: { id: job.id },
              data: { status: 'FAILED', error: err.message },
            })
          }
        }
      }
    }
  } else if (body.type === 'dm_send') {
    // DM sends via Apify (Instagram DM)
    const input = body.input as Record<string, unknown>
    try {
      const result = await routeService({
        tenantId,
        service: 'apify',
        action: 'send_instagram_dm',
        params: input,
      })
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: result.success ? 'RUNNING' : 'FAILED',
          externalId: result.success ? (result.data as any)?.runId : null,
          startedAt: new Date(),
          realCostUsd: result.cost,
        },
      })
    } catch (err: any) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: err.message },
      })
    }
  } else if (body.type === 'whatsapp_deploy') {
    // WhatsApp instance deployment — runs inline
    const input = body.input as Record<string, unknown>
    try {
      const result = await routeService({
        tenantId,
        service: 'evolution',
        action: 'create_instance',
        params: input,
      })
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: result.success ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          output: result.data as any,
          realCostUsd: result.cost,
        },
      })
    } catch (err: any) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: err.message },
      })
    }
  } else if (body.type === 'campaign_send') {
    // Campaign sends are handled by campaign launch endpoint
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
  }

  return c.json({ data: job }, 201)
})

// ═══ GET /:id — Get job ═══
jobs.get('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const job = await prisma.job.findFirst({
    where: { id, tenantId },
  })
  if (!job) throw new NotFoundError('Job')

  // If job is RUNNING and has externalId, check status from Apify
  if (job.status === 'RUNNING' && job.externalId && job.type === 'scrape') {
    try {
      const result = await routeService({
        tenantId,
        service: 'apify',
        action: 'get_run_status',
        params: { runId: job.externalId },
      })

      if (result.success) {
        const runData = result.data as any
        const apifyStatus = runData?.status

        if (apifyStatus === 'SUCCEEDED') {
          await prisma.job.update({
            where: { id },
            data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
          })
          job.status = 'COMPLETED'
          job.progress = 100
        } else if (apifyStatus === 'FAILED' || apifyStatus === 'ABORTED') {
          await prisma.job.update({
            where: { id },
            data: { status: 'FAILED', error: `Apify run ${apifyStatus}` },
          })
          job.status = 'FAILED'
        }
      }
    } catch {
      // Ignore status check errors
    }
  }

  return c.json({ data: job })
})

// ═══ POST /:id/cancel — Cancel job ═══
jobs.post('/:id/cancel', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const job = await prisma.job.findFirst({ where: { id, tenantId } })
  if (!job) throw new NotFoundError('Job')

  if (job.status !== 'PENDING' && job.status !== 'RUNNING') {
    return c.json({ error: `Cannot cancel job in ${job.status} status` }, 400)
  }

  await prisma.job.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  return c.json({ success: true })
})

// ═══ GET /:id/results — Get scrape results ═══
jobs.get('/:id/results', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const job = await prisma.job.findFirst({ where: { id, tenantId } })
  if (!job) throw new NotFoundError('Job')

  // If completed and no results yet, fetch from Apify
  if (job.status === 'COMPLETED' && job.externalId) {
    const existingResults = await prisma.scrapeResult.count({ where: { jobId: id } })

    if (existingResults === 0) {
      try {
        const result = await routeService({
          tenantId,
          service: 'apify',
          action: 'get_run_results',
          params: { runId: job.externalId },
        })

        if (result.success && Array.isArray(result.data)) {
          const scrapeData = (result.data as any[]).map(item => ({
            jobId: id,
            tenantId,
            platform: (job.input as any)?.platform || 'unknown',
            rawData: item,
          }))

          if (scrapeData.length) {
            await prisma.scrapeResult.createMany({ data: scrapeData })
          }
        }
      } catch (err) {
        logger.warn({ err, jobId: id }, 'Failed to fetch Apify results')
      }
    }
  }

  const results = await prisma.scrapeResult.findMany({
    where: { jobId: id },
    orderBy: { createdAt: 'asc' },
  })

  return c.json({ data: results, total: results.length })
})

export { jobs as jobRoutes }
