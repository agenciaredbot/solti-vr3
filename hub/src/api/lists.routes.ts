/**
 * Contact Lists API — Manage contact lists for campaigns.
 *
 * GET    /              List all lists
 * POST   /              Create list
 * GET    /:id           Get list with members
 * PATCH  /:id           Update list
 * DELETE /:id           Delete list
 * POST   /:id/members   Add contacts to list
 * DELETE /:id/members/:contactId  Remove contact from list
 * POST   /:id/populate  Auto-populate from search criteria
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'
import { NotFoundError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

const lists = new Hono()

const createListSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isDynamic: z.boolean().optional().default(false),
  filters: z.record(z.any()).optional().default({}),
})

// ═══ GET / — List all lists ═══
lists.get('/', async (c) => {
  const { tenantId } = getTenant(c)

  const result = await prisma.contactList.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { members: true } },
    },
  })

  return c.json({ data: result })
})

// ═══ POST / — Create list ═══
lists.post('/', async (c) => {
  const { tenantId } = getTenant(c)
  const body = createListSchema.parse(await c.req.json())

  const list = await prisma.contactList.create({
    data: {
      tenantId,
      name: body.name,
      description: body.description,
      isDynamic: body.isDynamic,
      filters: body.filters as any,
    },
  })

  logger.info({ tenantId, listId: list.id }, 'Contact list created')
  return c.json({ data: list }, 201)
})

// ═══ GET /:id — Get list with members ═══
lists.get('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const list = await prisma.contactList.findFirst({
    where: { id, tenantId },
    include: {
      members: {
        include: {
          contact: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, score: true, status: true },
          },
        },
      },
    },
  })

  if (!list) throw new NotFoundError('Contact list')
  return c.json({ data: list })
})

// ═══ PATCH /:id — Update list ═══
lists.patch('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')
  const body = createListSchema.partial().parse(await c.req.json())

  const existing = await prisma.contactList.findFirst({ where: { id, tenantId } })
  if (!existing) throw new NotFoundError('Contact list')

  const list = await prisma.contactList.update({
    where: { id },
    data: body,
  })

  return c.json({ data: list })
})

// ═══ DELETE /:id — Delete list ═══
lists.delete('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const existing = await prisma.contactList.findFirst({ where: { id, tenantId } })
  if (!existing) throw new NotFoundError('Contact list')

  // Delete members first (cascade should handle, but be explicit)
  await prisma.listMember.deleteMany({ where: { listId: id } })
  await prisma.contactList.delete({ where: { id } })

  return c.json({ success: true })
})

// ═══ POST /:id/members — Add contacts to list ═══
lists.post('/:id/members', async (c) => {
  const { tenantId } = getTenant(c)
  const listId = c.req.param('id')

  const body = z.object({
    contactIds: z.array(z.string().uuid()),
  }).parse(await c.req.json())

  const list = await prisma.contactList.findFirst({ where: { id: listId, tenantId } })
  if (!list) throw new NotFoundError('Contact list')

  // Check which contacts are already members
  const existing = await prisma.listMember.findMany({
    where: { listId, contactId: { in: body.contactIds } },
    select: { contactId: true },
  })
  const existingIds = new Set(existing.map((e: any) => e.contactId))

  const newMembers = body.contactIds
    .filter(id => !existingIds.has(id))
    .map(contactId => ({ listId, contactId }))

  if (newMembers.length) {
    await prisma.listMember.createMany({ data: newMembers })
  }

  return c.json({
    data: {
      added: newMembers.length,
      skipped: body.contactIds.length - newMembers.length,
      total: existing.length + newMembers.length,
    },
  })
})

// ═══ DELETE /:id/members/:contactId — Remove contact from list ═══
lists.delete('/:id/members/:contactId', async (c) => {
  const { tenantId } = getTenant(c)
  const listId = c.req.param('id')
  const contactId = c.req.param('contactId')

  const list = await prisma.contactList.findFirst({ where: { id: listId, tenantId } })
  if (!list) throw new NotFoundError('Contact list')

  await prisma.listMember.deleteMany({
    where: { listId, contactId },
  })

  return c.json({ success: true })
})

// ═══ POST /:id/populate — Auto-populate from search criteria ═══
lists.post('/:id/populate', async (c) => {
  const { tenantId } = getTenant(c)
  const listId = c.req.param('id')

  const body = z.object({
    minScore: z.number().optional(),
    maxScore: z.number().optional(),
    status: z.string().optional(),
    source: z.string().optional(),
    city: z.string().optional(),
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    limit: z.number().max(500).default(100),
  }).parse(await c.req.json())

  const list = await prisma.contactList.findFirst({ where: { id: listId, tenantId } })
  if (!list) throw new NotFoundError('Contact list')

  // Build search filters
  const where: any = { tenantId }
  if (body.minScore !== undefined) where.score = { ...where.score, gte: body.minScore }
  if (body.maxScore !== undefined) where.score = { ...where.score, lte: body.maxScore }
  if (body.status) where.status = body.status
  if (body.source) where.source = body.source
  if (body.city) where.city = { contains: body.city, mode: 'insensitive' }
  if (body.hasEmail) where.email = { not: null }
  if (body.hasPhone) where.OR = [{ phone: { not: null } }, { whatsapp: { not: null } }]

  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true },
    take: body.limit,
  })

  // Add to list (skip duplicates)
  const existing = await prisma.listMember.findMany({
    where: { listId },
    select: { contactId: true },
  })
  const existingIds = new Set(existing.map((e: any) => e.contactId))

  const newMembers = contacts
    .filter(c => !existingIds.has(c.id))
    .map(c => ({ listId, contactId: c.id }))

  if (newMembers.length) {
    await prisma.listMember.createMany({ data: newMembers })
  }

  return c.json({
    data: {
      matched: contacts.length,
      added: newMembers.length,
      skipped: contacts.length - newMembers.length,
      totalMembers: existing.length + newMembers.length,
    },
  })
})

export { lists as listRoutes }
