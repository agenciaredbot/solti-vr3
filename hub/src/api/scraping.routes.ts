/**
 * Scraping API — Dedicated endpoints for lead prospecting via Apify.
 *
 * POST   /start              Launch a scraping job
 * GET    /jobs                List scraping jobs
 * GET    /jobs/:id/status     Poll job status
 * GET    /jobs/:id/results    Get normalized results with dedup check
 * POST   /jobs/:id/import     Import selected results as contacts
 * POST   /enrich              Start contact enrichment
 * GET    /enrich/:id/results  Get enrichment results
 * POST   /cost-estimate       Preview cost before launching
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'
import { NotFoundError } from '../lib/errors.js'
import { routeService } from '../router/service-router.js'
import { getActionCost, getBalance } from '../services/credit.service.js'
import { findDuplicates, mergeContact } from '../services/dedup.service.js'
import { logger } from '../lib/logger.js'

const scraping = new Hono()

// ═══ Platform-specific validation schemas ═══

const platformParamsSchema = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal('google_maps'),
    searchQuery: z.string().min(1, 'searchQuery es requerido'),
    location: z.string().default('Colombia'),
    maxResults: z.number().int().min(1).max(500).default(100),
  }),
  z.object({
    platform: z.literal('instagram'),
    query: z.string().optional(),
    urls: z.array(z.string().url()).optional(),
    searchType: z.enum(['user', 'hashtag']).default('user'),
    max: z.number().int().min(1).max(500).default(50),
  }),
  z.object({
    platform: z.literal('linkedin'),
    searchUrl: z.string().url().refine(
      url => url.includes('linkedin.com'),
      'Debe ser una URL de LinkedIn'
    ),
    maxResults: z.number().int().min(1).max(500).default(100),
  }),
  z.object({
    platform: z.literal('tiktok'),
    query: z.string().min(1, 'query es requerido'),
    maxResults: z.number().int().min(1).max(500).default(50),
  }),
  z.object({
    platform: z.literal('website'),
    startUrls: z.array(z.string().url()).min(1, 'Al menos una URL es requerida'),
    maxResults: z.number().int().min(1).max(500).default(100),
  }),
])

// ═══ POST /start — Launch scraping job ═══
scraping.post('/start', async (c) => {
  const { tenantId } = getTenant(c)
  const body = platformParamsSchema.parse(await c.req.json())

  const action = `scrape_${body.platform}`
  const estimatedCredits = getActionCost('apify', action)

  // Create job record
  const job = await prisma.job.create({
    data: {
      tenantId,
      type: 'scrape',
      input: body as any,
      status: 'PENDING',
    },
  })

  try {
    const result = await routeService({
      tenantId,
      service: 'apify',
      action,
      params: body as unknown as Record<string, unknown>,
    })

    const runData = result.data as any
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: result.success ? 'RUNNING' : 'FAILED',
        externalId: runData?.runId || null,
        startedAt: new Date(),
        error: result.success ? null : result.description,
        realCostUsd: result.cost,
        creditsCost: estimatedCredits,
      },
    })

    // Log usage
    await prisma.usageLog.create({
      data: {
        tenantId,
        service: 'apify',
        action,
        realCostUsd: result.cost,
        metadata: { platform: body.platform, jobId: job.id },
      },
    }).catch(() => {})

    return c.json({
      data: {
        jobId: job.id,
        runId: runData?.runId,
        status: result.success ? 'RUNNING' : 'FAILED',
        estimatedCredits,
        estimatedCostUsd: result.cost,
      },
    }, 201)
  } catch (err: any) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: err.message },
    })
    throw err
  }
})

// ═══ GET /jobs — List scraping jobs ═══
scraping.get('/jobs', async (c) => {
  const { tenantId } = getTenant(c)
  const page = Number(c.req.query('page') || 1)
  const limit = Math.min(Number(c.req.query('limit') || 20), 50)

  const [list, total] = await Promise.all([
    prisma.job.findMany({
      where: { tenantId, type: { in: ['scrape', 'enrich'] } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.job.count({
      where: { tenantId, type: { in: ['scrape', 'enrich'] } },
    }),
  ])

  return c.json({
    data: list,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
})

// ═══ GET /jobs/:id/status — Poll job status ═══
scraping.get('/jobs/:id/status', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const job = await prisma.job.findFirst({ where: { id, tenantId } })
  if (!job) throw new NotFoundError('Job')

  // If RUNNING, check Apify for updates
  if (job.status === 'RUNNING' && job.externalId) {
    try {
      const result = await routeService({
        tenantId,
        service: 'apify',
        action: 'get_run_status',
        params: { runId: job.externalId },
      })

      if (result.success) {
        const apifyStatus = (result.data as any)?.status
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
        } else if (apifyStatus === 'RUNNING') {
          // Update progress estimate
          const started = job.startedAt ? new Date(job.startedAt).getTime() : Date.now()
          const elapsed = (Date.now() - started) / 1000
          const progress = Math.min(Math.round(elapsed / 3), 90) // rough estimate
          await prisma.job.update({ where: { id }, data: { progress } })
          job.progress = progress
        }
      }
    } catch {
      // Ignore status check errors, return last known state
    }
  }

  return c.json({
    data: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      platform: (job.input as any)?.platform,
    },
  })
})

// ═══ GET /jobs/:id/results — Get normalized results with dedup check ═══
scraping.get('/jobs/:id/results', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const job = await prisma.job.findFirst({ where: { id, tenantId } })
  if (!job) throw new NotFoundError('Job')

  // Fetch from Apify if completed and no stored results
  if (job.status === 'COMPLETED' && job.externalId) {
    const existingCount = await prisma.scrapeResult.count({ where: { jobId: id } })

    if (existingCount === 0) {
      try {
        const result = await routeService({
          tenantId,
          service: 'apify',
          action: 'get_run_results',
          params: { runId: job.externalId },
        })

        if (result.success) {
          const resultData = result.data as any
          const items = resultData?.items || resultData || []
          if (Array.isArray(items) && items.length > 0) {
            const scrapeData = items.map((item: any) => ({
              jobId: id,
              tenantId,
              platform: (job.input as any)?.platform || 'unknown',
              rawData: item,
            }))
            await prisma.scrapeResult.createMany({ data: scrapeData })
          }
        }
      } catch (err) {
        logger.warn({ err, jobId: id }, 'Failed to fetch Apify results')
      }
    }
  }

  // Fetch stored results
  const results = await prisma.scrapeResult.findMany({
    where: { jobId: id },
    orderBy: { createdAt: 'asc' },
  })

  const platform = (job.input as any)?.platform || 'unknown'

  // Normalize results into contact-friendly format
  const normalized = results.map(r => ({
    id: r.id,
    processed: r.processed,
    importedContactId: r.importedContactId,
    ...normalizeResult(platform, r.rawData as Record<string, any>),
  }))

  // Run dedup check against existing contacts
  const candidates = normalized.map(n => ({
    firstName: n.firstName,
    lastName: n.lastName,
    email: n.email,
    phone: n.phone,
    city: n.city,
  }))

  const duplicates = await findDuplicates(tenantId, candidates)
  const dupMap = new Map(duplicates.map(d => [d.candidateIndex, d]))

  const resultsWithDupes = normalized.map((n, i) => ({
    ...n,
    duplicate: dupMap.get(i) ? {
      contactId: dupMap.get(i)!.contactId,
      matchType: dupMap.get(i)!.matchType,
      confidence: dupMap.get(i)!.confidence,
      existingContact: dupMap.get(i)!.existingContact,
    } : null,
  }))

  return c.json({
    data: resultsWithDupes,
    total: results.length,
    duplicateCount: duplicates.length,
  })
})

// ═══ POST /jobs/:id/import — Import selected results as contacts ═══
scraping.post('/jobs/:id/import', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const body = z.object({
    resultIds: z.array(z.string()).min(1).max(500),
    mode: z.enum(['skip', 'merge', 'create_all']).default('skip'),
  }).parse(await c.req.json())

  const job = await prisma.job.findFirst({ where: { id, tenantId } })
  if (!job) throw new NotFoundError('Job')

  const results = await prisma.scrapeResult.findMany({
    where: { id: { in: body.resultIds }, jobId: id, tenantId },
  })

  const platform = (job.input as any)?.platform || 'unknown'
  let imported = 0
  let skipped = 0
  let merged = 0

  for (const result of results) {
    if (result.processed) {
      skipped++
      continue
    }

    const normalized = normalizeResult(platform, result.rawData as Record<string, any>)

    // Check for duplicates on this specific candidate
    const dupes = await findDuplicates(tenantId, [normalized])

    if (dupes.length > 0 && body.mode !== 'create_all') {
      const dupe = dupes[0]

      if (body.mode === 'skip') {
        await prisma.scrapeResult.update({
          where: { id: result.id },
          data: { processed: true, importedContactId: dupe.contactId },
        })
        skipped++
        continue
      }

      if (body.mode === 'merge') {
        await mergeContact(tenantId, dupe.contactId, normalized)
        await prisma.scrapeResult.update({
          where: { id: result.id },
          data: { processed: true, importedContactId: dupe.contactId },
        })
        merged++
        continue
      }
    }

    // Create new contact
    try {
      const contact = await prisma.contact.create({
        data: {
          tenantId,
          firstName: normalized.firstName || null,
          lastName: normalized.lastName || null,
          email: normalized.email || null,
          phone: normalized.phone || null,
          whatsapp: normalized.whatsapp || null,
          instagram: normalized.instagram || null,
          linkedin: normalized.linkedin || null,
          website: normalized.website || null,
          city: normalized.city || null,
          country: normalized.country || null,
          notes: normalized.notes || null,
          source: `apify_${platform}`,
          status: 'NEW',
          score: normalized.score || 0,
          rawData: result.rawData as any,
        },
      })

      await prisma.scrapeResult.update({
        where: { id: result.id },
        data: { processed: true, importedContactId: contact.id },
      })
      imported++
    } catch (err: any) {
      logger.warn({ err, resultId: result.id }, 'Failed to import contact')
      skipped++
    }
  }

  return c.json({
    data: { imported, skipped, merged, total: results.length },
  })
})

// ═══ POST /enrich — Start contact enrichment ═══
scraping.post('/enrich', async (c) => {
  const { tenantId } = getTenant(c)

  const body = z.object({
    contactIds: z.array(z.string()).min(1).max(50),
  }).parse(await c.req.json())

  // Fetch contacts and extract websites
  const contacts = await prisma.contact.findMany({
    where: { id: { in: body.contactIds }, tenantId },
    select: { id: true, website: true, firstName: true, lastName: true },
  })

  const urls = contacts
    .filter(c => c.website)
    .map(c => c.website as string)

  if (urls.length === 0) {
    return c.json({ error: 'Ninguno de los contactos seleccionados tiene website' }, 400)
  }

  const job = await prisma.job.create({
    data: {
      tenantId,
      type: 'enrich',
      input: { contactIds: body.contactIds, urls } as any,
      status: 'PENDING',
    },
  })

  try {
    const result = await routeService({
      tenantId,
      service: 'apify',
      action: 'enrich_contacts',
      params: { urls },
    })

    const runData = result.data as any
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: result.success ? 'RUNNING' : 'FAILED',
        externalId: runData?.runId || null,
        startedAt: new Date(),
        realCostUsd: result.cost,
      },
    })

    return c.json({
      data: {
        jobId: job.id,
        contactCount: urls.length,
        status: 'RUNNING',
      },
    }, 201)
  } catch (err: any) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: err.message },
    })
    throw err
  }
})

// ═══ GET /enrich/:id/results — Get enrichment results ═══
scraping.get('/enrich/:id/results', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const job = await prisma.job.findFirst({ where: { id, tenantId, type: 'enrich' } })
  if (!job) throw new NotFoundError('Enrichment job')

  // Check status if still running
  if (job.status === 'RUNNING' && job.externalId) {
    try {
      const statusResult = await routeService({
        tenantId,
        service: 'apify',
        action: 'get_run_status',
        params: { runId: job.externalId },
      })
      const apifyStatus = (statusResult.data as any)?.status
      if (apifyStatus === 'SUCCEEDED') {
        await prisma.job.update({
          where: { id },
          data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
        })
        job.status = 'COMPLETED'
      } else if (apifyStatus === 'FAILED' || apifyStatus === 'ABORTED') {
        await prisma.job.update({
          where: { id },
          data: { status: 'FAILED', error: `Enrichment run ${apifyStatus}` },
        })
        return c.json({ data: { status: 'FAILED', error: job.error } })
      }
    } catch {}
  }

  if (job.status !== 'COMPLETED') {
    return c.json({ data: { status: job.status, progress: job.progress } })
  }

  // Fetch enrichment results from Apify
  const enrichResult = await routeService({
    tenantId,
    service: 'apify',
    action: 'get_run_results',
    params: { runId: job.externalId },
  })

  const enrichData = enrichResult.data as any
  const items = enrichData?.items || enrichData || []
  const contactIds = ((job.input as any)?.contactIds || []) as string[]
  const urls = ((job.input as any)?.urls || []) as string[]

  // Match enrichment results back to contacts by URL
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, tenantId },
  })

  const updates: { contactId: string; fieldsUpdated: string[] }[] = []

  for (const item of items) {
    const itemUrl = item.url || item.website || ''
    const matchingContact = contacts.find(c => c.website && itemUrl.includes(c.website))

    if (matchingContact) {
      const newData: Record<string, unknown> = {}
      const fieldsUpdated: string[] = []

      const emails = item.emails || []
      const phones = item.phones || []

      if (emails.length > 0 && !matchingContact.email) {
        newData.email = emails[0]
        fieldsUpdated.push('email')
      }
      if (phones.length > 0 && !matchingContact.phone) {
        newData.phone = phones[0]
        fieldsUpdated.push('phone')
      }

      if (fieldsUpdated.length > 0) {
        await prisma.contact.update({
          where: { id: matchingContact.id },
          data: newData,
        })
        updates.push({ contactId: matchingContact.id, fieldsUpdated })
      }
    }
  }

  return c.json({
    data: {
      status: 'COMPLETED',
      enriched: updates.length,
      totalProcessed: items.length,
      updates,
    },
  })
})

// ═══ POST /cost-estimate — Preview cost before launching ═══
scraping.post('/cost-estimate', async (c) => {
  const { tenantId } = getTenant(c)

  const body = z.object({
    platform: z.enum(['google_maps', 'instagram', 'linkedin', 'tiktok', 'website']),
    maxResults: z.number().int().min(1).max(500).default(100),
  }).parse(await c.req.json())

  const action = `scrape_${body.platform}`
  const estimatedCredits = getActionCost('apify', action)
  const balance = await getBalance(tenantId)

  // Rough USD cost estimates based on platform
  const usdCosts: Record<string, number> = {
    google_maps: 0.50,
    instagram: 0.30,
    linkedin: 0.50,
    tiktok: 0.30,
    website: 0.20,
  }

  return c.json({
    data: {
      platform: body.platform,
      estimatedCredits,
      estimatedCostUsd: usdCosts[body.platform] || 0.30,
      currentBalance: balance.available,
      hasBalance: balance.available >= estimatedCredits,
    },
  })
})

// ═══ Result Normalizers ═══

interface NormalizedContact {
  [key: string]: unknown
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  instagram?: string | null
  linkedin?: string | null
  website?: string | null
  city?: string | null
  country?: string | null
  notes?: string | null
  source?: string
  sourceUrl?: string | null
  score?: number
}

function normalizeResult(platform: string, raw: Record<string, any>): NormalizedContact {
  switch (platform) {
    case 'google_maps':
      return normalizeGoogleMaps(raw)
    case 'instagram':
      return normalizeInstagram(raw)
    case 'linkedin':
      return normalizeLinkedIn(raw)
    case 'tiktok':
      return normalizeTikTok(raw)
    case 'website':
      return normalizeWebsite(raw)
    default:
      return { firstName: raw.name || raw.title, source: platform }
  }
}

function normalizeGoogleMaps(raw: Record<string, any>): NormalizedContact {
  const name = raw.title || raw.name || ''
  return {
    firstName: name,
    lastName: null,
    email: raw.email || null,
    phone: raw.phone || raw.phoneUnformatted || null,
    website: raw.website || raw.url || null,
    city: raw.city || raw.address?.split(',')[0]?.trim() || null,
    country: raw.country || null,
    notes: [raw.categoryName, raw.address].filter(Boolean).join(' | '),
    source: 'google_maps',
    sourceUrl: raw.url || raw.googleUrl || null,
    score: raw.totalScore ? Math.min(Math.round(raw.totalScore * 20), 100) : 10,
  }
}

function normalizeInstagram(raw: Record<string, any>): NormalizedContact {
  const fullName = raw.fullName || raw.name || ''
  const parts = fullName.split(' ')
  return {
    firstName: parts[0] || null,
    lastName: parts.slice(1).join(' ') || null,
    email: raw.email || null,
    phone: raw.phone || null,
    instagram: raw.username || null,
    website: raw.externalUrl || raw.website || null,
    city: raw.city || null,
    notes: raw.biography || null,
    source: 'instagram',
    sourceUrl: raw.username ? `https://instagram.com/${raw.username}` : null,
    score: raw.followersCount > 10000 ? 40 : raw.followersCount > 1000 ? 25 : 10,
  }
}

function normalizeLinkedIn(raw: Record<string, any>): NormalizedContact {
  return {
    firstName: raw.firstName || raw.first_name || null,
    lastName: raw.lastName || raw.last_name || null,
    email: raw.email || null,
    phone: raw.phone || null,
    linkedin: raw.profileUrl || raw.linkedinUrl || raw.url || null,
    website: raw.website || null,
    city: raw.location || raw.city || null,
    notes: raw.headline || raw.title || null,
    source: 'linkedin',
    sourceUrl: raw.profileUrl || raw.linkedinUrl || null,
    score: 30,
  }
}

function normalizeTikTok(raw: Record<string, any>): NormalizedContact {
  const name = raw.authorMeta?.name || raw.author?.nickname || raw.nickname || ''
  return {
    firstName: name,
    lastName: null,
    email: null,
    phone: null,
    tiktok: raw.authorMeta?.name || raw.author?.uniqueId || null,
    website: raw.authorMeta?.bioLink || null,
    city: null,
    notes: raw.authorMeta?.signature || raw.text || null,
    source: 'tiktok',
    sourceUrl: raw.authorMeta?.name ? `https://tiktok.com/@${raw.authorMeta.name}` : null,
    score: raw.authorMeta?.fans > 10000 ? 35 : raw.authorMeta?.fans > 1000 ? 20 : 10,
  }
}

function normalizeWebsite(raw: Record<string, any>): NormalizedContact {
  const emails = raw.emails as string[] || []
  const phones = raw.phones as string[] || []
  return {
    firstName: raw.title || null,
    email: emails[0] || null,
    phone: phones[0] || null,
    website: raw.url || null,
    source: 'website',
    sourceUrl: raw.url || null,
    score: emails.length > 0 ? 25 : 5,
  }
}

export { scraping as scrapingRoutes }
