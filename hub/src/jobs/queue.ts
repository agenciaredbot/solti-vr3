/**
 * BullMQ Queue Setup
 *
 * Queues:
 * - solti:campaigns  → Campaign step execution (email, DM, WhatsApp sends)
 * - solti:scraping   → Apify scrape jobs + result ingestion
 * - solti:publishing  → Social media post publishing via getLate
 *
 * Requires REDIS_URL in .env. Gracefully degrades if Redis unavailable.
 */

import { logger } from '../lib/logger.js'

// Types for job data (used even without BullMQ)
export interface CampaignJobData {
  tenantId: string
  campaignId: string
  recipientId: string
  stepNumber: number
  channel: string
  contactEmail?: string
  contactPhone?: string
  subject?: string
  body: string
}

export interface ScrapeJobData {
  tenantId: string
  jobId: string
  platform: string
  params: Record<string, unknown>
}

export interface PublishJobData {
  tenantId: string
  postId: string
  platform: string
  content: string
  mediaUrls: string[]
}

export interface WhatsappSendJobData {
  tenantId: string
  campaignId: string
  recipientId: string
  contactId: string
  phone: string
  message: {
    text: string
    mediaUrl?: string
    mediaType?: string // image, video, document, audio
    fileName?: string
  }
  instanceId: string // assigned by rotator
  attempt: number
}

export interface AutoReplyJobData {
  tenantId: string
  instanceId: string
  conversationId: string
  contactPhone: string
  inboundMessage: string
  pushName?: string
}

// Lazy initialization — only connects to Redis when actually needed
let _queuesInitialized = false
let _campaignQueue: any = null
let _scrapeQueue: any = null
let _publishQueue: any = null
let _whatsappSendQueue: any = null
let _autoReplyQueue: any = null

async function initQueues() {
  if (_queuesInitialized) return

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.warn('REDIS_URL not set — BullMQ queues disabled. Jobs will run inline.')
    _queuesInitialized = true
    return
  }

  try {
    // Dynamic import — only loads bullmq when Redis is available
    const { Queue } = await import('bullmq')
    const connection = { url: redisUrl }

    _campaignQueue = new Queue('solti-campaigns', { connection })
    _scrapeQueue = new Queue('solti-scraping', { connection })
    _publishQueue = new Queue('solti-publishing', { connection })
    _whatsappSendQueue = new Queue('solti-whatsapp-send', { connection })
    _autoReplyQueue = new Queue('solti-whatsapp-autoreply', { connection })

    logger.info('BullMQ queues initialized')
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize BullMQ — running without queues')
  }

  _queuesInitialized = true
}

/**
 * Enqueue a campaign send step.
 */
export async function enqueueCampaignStep(data: CampaignJobData): Promise<string | null> {
  await initQueues()
  if (!_campaignQueue) return null

  const job = await _campaignQueue.add('send-step', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  })

  return job.id
}

/**
 * Enqueue a scraping job.
 */
export async function enqueueScrapeJob(data: ScrapeJobData): Promise<string | null> {
  await initQueues()
  if (!_scrapeQueue) return null

  const job = await _scrapeQueue.add('scrape', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  })

  return job.id
}

/**
 * Enqueue a social media publish.
 */
export async function enqueuePublishJob(data: PublishJobData): Promise<string | null> {
  await initQueues()
  if (!_publishQueue) return null

  const job = await _publishQueue.add('publish', data, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  })

  return job.id
}

/**
 * Enqueue a WhatsApp campaign message send.
 * Each job = 1 message to 1 recipient.
 * Delay between jobs is controlled by the producer, not here.
 */
export async function enqueueWhatsappSend(data: WhatsappSendJobData, delayMs = 0): Promise<string | null> {
  await initQueues()
  if (!_whatsappSendQueue) return null

  const job = await _whatsappSendQueue.add('wa-send', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 200,
    removeOnFail: 1000,
    delay: delayMs,
  })

  return job.id
}

/**
 * Enqueue an auto-reply generation.
 */
export async function enqueueAutoReply(data: AutoReplyJobData): Promise<string | null> {
  await initQueues()
  if (!_autoReplyQueue) return null

  const job = await _autoReplyQueue.add('auto-reply', data, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  })

  return job.id
}
