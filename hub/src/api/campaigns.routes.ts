/**
 * Campaigns API — Multi-channel outreach campaign management.
 *
 * GET    /              List campaigns
 * POST   /              Create campaign
 * GET    /:id           Get campaign with steps + stats
 * PATCH  /:id           Update campaign
 * DELETE /:id           Delete campaign
 * POST   /:id/steps     Add step to campaign
 * PATCH  /:id/steps/:stepId  Update step
 * DELETE /:id/steps/:stepId  Delete step
 * POST   /:id/launch    Launch campaign (start sending)
 * POST   /:id/pause     Pause campaign
 * GET    /:id/recipients  List recipients with status
 * GET    /:id/events    List campaign events (timeline)
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'
import { NotFoundError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { enqueueCampaignStep } from '../jobs/queue.js'
import { renderTemplate } from '../lib/template.js'

const campaigns = new Hono()

const createCampaignSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['email', 'instagram_dm', 'linkedin_dm', 'whatsapp', 'multi_channel']),
  listId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
})

const createStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  delayDays: z.number().int().min(0).default(0),
  type: z.enum(['initial', 'followup', 'breakup']),
  channel: z.enum(['email', 'instagram_dm', 'linkedin_dm', 'whatsapp']),
  subject: z.string().optional(),
  body: z.string().min(1),
  condition: z.enum(['no_reply', 'no_open', 'always']).default('no_reply'),
})

// ═══ GET / — List campaigns ═══
campaigns.get('/', async (c) => {
  const { tenantId } = getTenant(c)

  const list = await prisma.campaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      list: { select: { id: true, name: true } },
      _count: { select: { recipients: true } },
    },
  })

  return c.json({ data: list })
})

// ═══ POST / — Create campaign ═══
campaigns.post('/', async (c) => {
  const { tenantId } = getTenant(c)
  const body = createCampaignSchema.parse(await c.req.json())

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      name: body.name,
      type: body.type,
      listId: body.listId || null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      settings: body.settings,
    },
  })

  logger.info({ tenantId, campaignId: campaign.id }, 'Campaign created')
  return c.json({ data: campaign }, 201)
})

// ═══ GET /:id — Get campaign details ═══
campaigns.get('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const campaign = await prisma.campaign.findFirst({
    where: { id, tenantId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      list: true,
      _count: { select: { recipients: true, events: true } },
    },
  })

  if (!campaign) throw new NotFoundError('Campaign')
  return c.json({ data: campaign })
})

// ═══ PATCH /:id — Update campaign ═══
campaigns.patch('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')
  const body = createCampaignSchema.partial().parse(await c.req.json())

  const existing = await prisma.campaign.findFirst({ where: { id, tenantId } })
  if (!existing) throw new NotFoundError('Campaign')

  if (existing.status !== 'DRAFT') {
    return c.json({ error: 'Can only edit campaigns in DRAFT status' }, 400)
  }

  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.type !== undefined) updateData.type = body.type
  if (body.listId !== undefined) updateData.listId = body.listId
  if (body.scheduledAt !== undefined) updateData.scheduledAt = new Date(body.scheduledAt)
  if (body.settings !== undefined) updateData.settings = body.settings

  const campaign = await prisma.campaign.update({
    where: { id },
    data: updateData as any,
  })

  return c.json({ data: campaign })
})

// ═══ DELETE /:id — Delete campaign ═══
campaigns.delete('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const existing = await prisma.campaign.findFirst({ where: { id, tenantId } })
  if (!existing) throw new NotFoundError('Campaign')

  await prisma.campaign.delete({ where: { id } })
  return c.json({ success: true })
})

// ═══ POST /:id/steps — Add step ═══
campaigns.post('/:id/steps', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')
  const body = createStepSchema.parse(await c.req.json())

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')
  if (campaign.status !== 'DRAFT') {
    return c.json({ error: 'Can only add steps to DRAFT campaigns' }, 400)
  }

  const step = await prisma.campaignStep.create({
    data: { campaignId, ...body },
  })

  return c.json({ data: step }, 201)
})

// ═══ PATCH /:id/steps/:stepId — Update step ═══
campaigns.patch('/:id/steps/:stepId', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')
  const stepId = c.req.param('stepId')

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')

  const body = createStepSchema.partial().parse(await c.req.json())

  const step = await prisma.campaignStep.update({
    where: { id: stepId },
    data: body,
  })

  return c.json({ data: step })
})

// ═══ DELETE /:id/steps/:stepId — Delete step ═══
campaigns.delete('/:id/steps/:stepId', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')
  const stepId = c.req.param('stepId')

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')

  await prisma.campaignStep.delete({ where: { id: stepId } })
  return c.json({ success: true })
})

// ═══ POST /:id/launch — Launch campaign ═══
campaigns.post('/:id/launch', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { steps: true, list: { include: { members: true } } },
  })
  if (!campaign) throw new NotFoundError('Campaign')

  if (!campaign.steps.length) {
    return c.json({ error: 'Campaign has no steps' }, 400)
  }
  if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
    return c.json({ error: `Cannot launch campaign in ${campaign.status} status` }, 400)
  }

  // Create recipients from list members
  if (campaign.list?.members.length) {
    const existingRecipients = await prisma.campaignRecipient.findMany({
      where: { campaignId },
      select: { contactId: true },
    })
    const existingContactIds = new Set(existingRecipients.map(r => r.contactId))

    const newRecipients = campaign.list.members
      .filter(m => !existingContactIds.has(m.contactId))
      .map(m => ({
        campaignId,
        contactId: m.contactId,
        status: 'PENDING' as const,
      }))

    if (newRecipients.length) {
      await prisma.campaignRecipient.createMany({ data: newRecipients })
    }
  }

  // Update campaign status
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENDING',
      startedAt: campaign.startedAt || new Date(),
    },
  })

  // Enqueue BullMQ jobs for each recipient × first step
  const firstStep = campaign.steps.sort((a, b) => a.stepNumber - b.stepNumber)[0]
  if (firstStep) {
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' },
      include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, whatsapp: true, city: true, country: true, website: true, customFields: true } } },
    })

    let enqueued = 0
    for (const r of recipients) {
      // Personalize template for this contact
      const templateCtx = {
        firstName: r.contact.firstName,
        lastName: r.contact.lastName,
        email: r.contact.email,
        phone: r.contact.phone,
        whatsapp: r.contact.whatsapp,
        company: `${r.contact.firstName || ''} ${r.contact.lastName || ''}`.trim(),
        city: r.contact.city,
        country: r.contact.country,
        website: r.contact.website,
        customFields: r.contact.customFields,
        campaignName: campaign.name,
        stepNumber: firstStep.stepNumber,
      }
      const personalizedBody = renderTemplate(firstStep.body, templateCtx)
      const personalizedSubject = firstStep.subject
        ? renderTemplate(firstStep.subject, templateCtx)
        : undefined

      const queueId = await enqueueCampaignStep({
        tenantId,
        campaignId,
        recipientId: r.id,
        stepNumber: firstStep.stepNumber,
        channel: firstStep.channel,
        contactEmail: r.contact.email || undefined,
        contactPhone: r.contact.whatsapp || r.contact.phone || undefined,
        subject: personalizedSubject,
        body: personalizedBody,
      })

      if (queueId) {
        enqueued++
      } else {
        // No Redis — execute inline via service router
        try {
          const { routeService } = await import('../router/service-router.js')
          if (firstStep.channel === 'email' && r.contact.email) {
            await routeService({
              tenantId,
              service: 'brevo',
              action: 'send_email',
              params: {
                to: r.contact.email,
                toName: `${r.contact.id}`,
                subject: firstStep.subject || 'Sin asunto',
                html: firstStep.body,
                tags: [`campaign:${campaignId}`],
              },
            })
          } else if (firstStep.channel === 'whatsapp' && (r.contact.whatsapp || r.contact.phone)) {
            await routeService({
              tenantId,
              service: 'evolution',
              action: 'send_text',
              params: {
                instanceName: `solti-${tenantId.slice(0, 8)}`,
                number: r.contact.whatsapp || r.contact.phone,
                text: firstStep.body,
              },
            })
          } else if (firstStep.channel === 'instagram_dm') {
            await routeService({
              tenantId,
              service: 'apify',
              action: 'send_instagram_dm',
              params: {
                usernames: [r.contact.id], // Will be resolved from contact instagram field
                message: firstStep.body,
              },
            })
          }

          await prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { currentStep: firstStep.stepNumber, status: 'SENT', lastSentAt: new Date() },
          })
          await prisma.campaignEvent.create({
            data: {
              campaignId,
              recipientId: r.id,
              contactId: r.contact.id,
              stepNumber: firstStep.stepNumber,
              eventType: 'sent',
            },
          })
          enqueued++
        } catch (err: any) {
          logger.warn({ err: err.message, recipientId: r.id }, 'Inline campaign send failed')
          await prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { status: 'FAILED' },
          })
        }
      }
    }

    logger.info({ tenantId, campaignId, enqueued, total: recipients.length }, 'Campaign launched')
  }

  return c.json({ success: true, message: 'Campaign launched' })
})

// ═══ POST /:id/pause — Pause campaign ═══
campaigns.post('/:id/pause', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')

  if (campaign.status !== 'SENDING') {
    return c.json({ error: 'Can only pause a SENDING campaign' }, 400)
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'PAUSED', pausedAt: new Date() },
  })

  return c.json({ success: true })
})

// ═══ POST /:id/resume — Resume a paused campaign ═══
campaigns.post('/:id/resume', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')

  if (campaign.status !== 'PAUSED') {
    return c.json({ error: 'Can only resume a PAUSED campaign' }, 400)
  }

  // For WhatsApp campaigns, re-launch pending recipients via BullMQ
  if (campaign.type === 'whatsapp') {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING' },
    })

    // Re-enqueue pending/queued recipients
    const { enqueueWhatsappSend } = await import('../jobs/queue.js')
    const { getNextInstance } = await import('../services/instance.rotator.js')
    const { normalizePhone } = await import('../services/recipient.resolver.js')

    const settings = (campaign.settings as Record<string, unknown>) || {}
    const delaySeconds = (settings.delaySeconds as number) || 5

    const pending = await prisma.campaignRecipient.findMany({
      where: { campaignId, status: { in: ['PENDING', 'QUEUED'] } },
      include: { contact: { select: { id: true, phone: true, whatsapp: true } } },
    })

    let enqueued = 0
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i]
      const phone = r.phone || normalizePhone(r.contact.whatsapp || r.contact.phone)
      if (!phone) continue

      const instanceName = await getNextInstance(tenantId, campaignId)
      if (!instanceName) break

      const jobId = await enqueueWhatsappSend({
        tenantId,
        campaignId,
        recipientId: r.id,
        contactId: r.contact.id,
        phone,
        message: { text: r.personalizedText || '' },
        instanceId: instanceName,
        attempt: r.attempts + 1,
      }, i * delaySeconds * 1000)

      if (jobId) enqueued++
    }

    return c.json({ success: true, enqueued, total: pending.length })
  }

  // For other campaign types, just change status
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'SENDING' },
  })

  return c.json({ success: true })
})

// ═══ GET /:id/recipients — List recipients ═══
campaigns.get('/:id/recipients', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
    orderBy: { status: 'asc' },
  })

  return c.json({ data: recipients })
})

// ═══ GET /:id/events — Campaign event timeline ═══
campaigns.get('/:id/events', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')

  const events = await prisma.campaignEvent.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  return c.json({ data: events })
})

// ═══ POST /:id/launch-whatsapp — Launch WhatsApp campaign via BullMQ ═══
const launchWhatsAppSchema = z.object({
  instanceIds: z.array(z.string().uuid()).min(1).max(2).optional(),
  delaySeconds: z.number().min(3).max(15).default(5),
  maxPerHourPerInstance: z.number().min(30).max(80).default(60),
  maxPerDayPerInstance: z.number().min(100).max(1000).default(500),
  sendingWindowStart: z.number().min(0).max(23).default(8),
  sendingWindowEnd: z.number().min(1).max(24).default(20),
  maxConsecutiveFailures: z.number().min(1).max(10).default(3),
  timezone: z.string().default('America/Bogota'),
})

campaigns.post('/:id/launch-whatsapp', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')
  const body = launchWhatsAppSchema.parse(await c.req.json())

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, tenantId, type: 'whatsapp' },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
  })
  if (!campaign) throw new NotFoundError('Campaign')

  if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
    return c.json({ error: `Cannot launch campaign in ${campaign.status} status` }, 400)
  }

  // Get message text — from messageText field or first step body
  const messageText = campaign.messageText || campaign.steps[0]?.body
  if (!messageText) {
    return c.json({ error: 'Campaign has no message text configured' }, 400)
  }

  // Get media if attached
  let mediaUrl: string | undefined
  let mediaType: string | undefined
  let mediaFileName: string | undefined
  if (campaign.mediaId) {
    const media = await prisma.mediaFile.findFirst({ where: { id: campaign.mediaId } })
    if (media) {
      mediaUrl = media.publicUrl
      mediaType = media.type.toLowerCase() // IMAGE → image
      mediaFileName = media.filename
    }
  }

  // Verify at least one instance is connected
  const instanceFilter: Record<string, unknown> = { tenantId, status: 'CONNECTED' }
  if (body.instanceIds?.length) {
    instanceFilter.id = { in: body.instanceIds }
  }
  const connectedInstances = await prisma.whatsappInstance.findMany({
    where: instanceFilter,
    select: { id: true, instanceName: true },
  })

  if (connectedInstances.length === 0) {
    return c.json({ error: 'No hay instancias de WhatsApp conectadas' }, 400)
  }

  // Resolve recipients using shared resolver
  const { resolveWhatsappRecipients } = await import('../services/recipient.resolver.js')
  const { normalizePhone } = await import('../services/recipient.resolver.js')

  const recipientConfig = (campaign.recipientConfig as { listId?: string; filters?: any }) || {}
  // Fallback to campaign.listId if no recipientConfig
  if (!recipientConfig.listId && campaign.listId) {
    recipientConfig.listId = campaign.listId
  }

  if (!recipientConfig.listId && !recipientConfig.filters) {
    return c.json({ error: 'Campaign has no recipients configured (no list or filters)' }, 400)
  }

  const resolvedContacts = await resolveWhatsappRecipients(tenantId, recipientConfig)

  if (resolvedContacts.length === 0) {
    return c.json({ error: 'No valid WhatsApp recipients found (all filtered, missing phone, or blacklisted)' }, 400)
  }

  // Create CampaignRecipient records for new contacts
  const existingRecipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: { contactId: true },
  })
  const existingContactIds = new Set(existingRecipients.map(r => r.contactId))

  const newRecipients = resolvedContacts
    .filter(r => !existingContactIds.has(r.contactId))
    .map(r => ({
      campaignId,
      contactId: r.contactId,
      phone: normalizePhone(r.whatsapp || r.phone),
      status: 'QUEUED' as const,
    }))

  if (newRecipients.length) {
    await prisma.campaignRecipient.createMany({ data: newRecipients })
  }

  // Update campaign settings and status
  const campaignSettings = {
    ...(typeof campaign.settings === 'object' && campaign.settings !== null ? campaign.settings as Record<string, unknown> : {}),
    instanceIds: connectedInstances.map(i => i.id),
    delaySeconds: body.delaySeconds,
    maxPerHourPerInstance: body.maxPerHourPerInstance,
    maxPerDayPerInstance: body.maxPerDayPerInstance,
    sendingWindowStart: body.sendingWindowStart,
    sendingWindowEnd: body.sendingWindowEnd,
    maxConsecutiveFailures: body.maxConsecutiveFailures,
    timezone: body.timezone,
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENDING',
      launchedAt: campaign.launchedAt || new Date(),
      startedAt: campaign.startedAt || new Date(),
      settings: campaignSettings,
      stats: {
        total: resolvedContacts.length,
        sent: 0, delivered: 0, read: 0, replied: 0, failed: 0,
        pending: resolvedContacts.length,
      },
    },
  })

  // Enqueue jobs — one per recipient, with staggered delays
  const { enqueueWhatsappSend } = await import('../jobs/queue.js')
  const { getNextInstance } = await import('../services/instance.rotator.js')

  const pendingRecipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: { in: ['PENDING', 'QUEUED'] } },
    include: {
      contact: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          phone: true, whatsapp: true, city: true, country: true,
          website: true, customFields: true,
        },
      },
    },
  })

  let enqueued = 0
  for (let i = 0; i < pendingRecipients.length; i++) {
    const r = pendingRecipients[i]
    const phone = r.phone || normalizePhone(r.contact.whatsapp || r.contact.phone)
    if (!phone) continue

    // Personalize message
    const personalizedText = renderTemplate(messageText, {
      firstName: r.contact.firstName,
      lastName: r.contact.lastName,
      email: r.contact.email,
      phone: r.contact.phone,
      whatsapp: r.contact.whatsapp,
      city: r.contact.city,
      country: r.contact.country,
      website: r.contact.website,
      customFields: r.contact.customFields,
      campaignName: campaign.name,
      stepNumber: 1,
    })

    // Rotate instance
    const instanceName = await getNextInstance(tenantId, campaignId, connectedInstances.map(i => i.id))
    if (!instanceName) continue

    const delayMs = i * body.delaySeconds * 1000 // Stagger jobs

    const jobId = await enqueueWhatsappSend({
      tenantId,
      campaignId,
      recipientId: r.id,
      contactId: r.contact.id,
      phone,
      message: {
        text: personalizedText,
        mediaUrl,
        mediaType,
        fileName: mediaFileName,
      },
      instanceId: instanceName,
      attempt: 1,
    }, delayMs)

    if (jobId) {
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: 'QUEUED', personalizedText, phone },
      })
      enqueued++
    }
  }

  logger.info({ tenantId, campaignId, enqueued, total: pendingRecipients.length }, 'WhatsApp campaign launched via BullMQ')

  return c.json({
    success: true,
    message: 'Campaña de WhatsApp iniciada',
    stats: {
      totalRecipients: resolvedContacts.length,
      enqueued,
      instances: connectedInstances.map(i => i.instanceName),
      estimatedTimeMinutes: Math.ceil((enqueued * body.delaySeconds) / 60),
    },
  })
})

// ═══ GET /:id/stats — Get campaign stats ═══
campaigns.get('/:id/stats', async (c) => {
  const { tenantId } = getTenant(c)
  const campaignId = c.req.param('id')

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })
  if (!campaign) throw new NotFoundError('Campaign')

  const [total, sent, failed, pending] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId } }),
    prisma.campaignRecipient.count({ where: { campaignId, status: 'SENT' } }),
    prisma.campaignRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    prisma.campaignRecipient.count({ where: { campaignId, status: 'PENDING' } }),
  ])

  const events = await prisma.campaignEvent.groupBy({
    by: ['eventType'],
    where: { campaignId },
    _count: true,
  })

  const eventCounts: Record<string, number> = {}
  for (const e of events) {
    eventCounts[e.eventType] = e._count
  }

  return c.json({
    data: {
      status: campaign.status,
      total,
      sent,
      failed,
      pending,
      delivered: eventCounts['delivered'] || 0,
      read: eventCounts['read'] || 0,
      replied: eventCounts['replied'] || 0,
    },
  })
})

export { campaigns as campaignRoutes }
