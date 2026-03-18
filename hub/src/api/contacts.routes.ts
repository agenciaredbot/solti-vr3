/**
 * Contacts API — CRM contact management.
 *
 * GET    /                 List contacts (paginated, filterable)
 * GET    /:id              Get single contact
 * POST   /                 Create contact
 * PATCH  /:id              Update contact
 * DELETE /:id              Delete contact
 * POST   /search           Full-text search
 * POST   /bulk             Bulk import contacts
 * GET    /:id/activities   Contact activity timeline
 * POST   /:id/tags         Add tags to contact
 * DELETE /:id/tags/:tagId  Remove tag from contact
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'
import { NotFoundError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

const contacts = new Hono()

// ═══ Schemas ═══
const createContactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  tiktok: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
  youtube: z.string().optional(),
  website: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  language: z.string().optional(),
  gender: z.string().optional(),
  birthday: z.string().optional().transform(v => v ? new Date(v) : undefined),
  address: z.string().optional(),
  zipCode: z.string().optional(),
  state: z.string().optional(),
  revenue: z.string().optional(),
  employees: z.string().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'CUSTOMER', 'LOST']).default('NEW'),
  score: z.number().min(0).max(100).default(0),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
})

const updateContactSchema = createContactSchema.partial()

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(25),
  status: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'score', 'first_name']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

// ═══ GET / — List contacts ═══
contacts.get('/', async (c) => {
  const { tenantId } = getTenant(c)
  const query = listQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams))

  const where: Record<string, unknown> = { tenantId }
  if (query.status) where.status = query.status
  if (query.source) where.source = query.source
  if (query.tag) where.contactTags = { some: { tagId: query.tag } }
  if (query.city) where.city = { contains: query.city, mode: 'insensitive' }
  if (query.country) where.country = { contains: query.country, mode: 'insensitive' }
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: 'insensitive' } },
      { lastName: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
      { phone: { contains: query.search } },
    ]
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where: where as any,
      orderBy: { [query.sortBy === 'first_name' ? 'firstName' : query.sortBy === 'created_at' ? 'createdAt' : query.sortBy === 'updated_at' ? 'updatedAt' : query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        contactTags: { include: { tag: true } },
      },
    }),
    prisma.contact.count({ where: where as any }),
  ])

  return c.json({
    data: contacts,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  })
})

// ═══ GET /:id — Get contact ═══
contacts.get('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId },
    include: {
      contactTags: { include: { tag: true } },
      contactCompanies: { include: { company: true } },
      deals: { orderBy: { createdAt: 'desc' }, take: 5 },
      activities: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })

  if (!contact) throw new NotFoundError('Contact')
  return c.json({ data: contact })
})

// ═══ POST / — Create contact ═══
contacts.post('/', async (c) => {
  const { tenantId } = getTenant(c)
  const body = createContactSchema.parse(await c.req.json())

  const contact = await prisma.contact.create({
    data: { ...body, tenantId },
  })

  logger.info({ tenantId, contactId: contact.id }, 'Contact created')
  return c.json({ data: contact }, 201)
})

// ═══ PATCH /:id — Update contact ═══
contacts.patch('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')
  const body = updateContactSchema.parse(await c.req.json())

  // Ensure contact belongs to tenant
  const existing = await prisma.contact.findFirst({ where: { id, tenantId } })
  if (!existing) throw new NotFoundError('Contact')

  const contact = await prisma.contact.update({
    where: { id },
    data: body,
  })

  return c.json({ data: contact })
})

// ═══ DELETE /:id — Delete contact ═══
contacts.delete('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const existing = await prisma.contact.findFirst({ where: { id, tenantId } })
  if (!existing) throw new NotFoundError('Contact')

  await prisma.contact.delete({ where: { id } })

  return c.json({ success: true })
})

// ═══ POST /search — Full-text search ═══
contacts.post('/search', async (c) => {
  const { tenantId } = getTenant(c)
  const { query, limit = 20 } = await c.req.json() as { query: string; limit?: number }

  // Use Prisma full-text search (backed by GIN index with Spanish dictionary)
  const results = await prisma.contact.findMany({
    where: {
      tenantId,
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
        { whatsapp: { contains: query } },
        { city: { contains: query, mode: 'insensitive' } },
        { notes: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: Math.min(limit, 50),
    orderBy: { score: 'desc' },
    include: {
      contactTags: { include: { tag: true } },
    },
  })

  return c.json({ data: results, total: results.length })
})

// ═══ POST /bulk — Bulk import contacts ═══
contacts.post('/bulk', async (c) => {
  const { tenantId } = getTenant(c)
  const { contacts: items } = await c.req.json() as { contacts: z.infer<typeof createContactSchema>[] }

  if (!items?.length) {
    return c.json({ error: 'No contacts provided' }, 400)
  }
  if (items.length > 500) {
    return c.json({ error: 'Max 500 contacts per batch' }, 400)
  }

  const validated = items.map(item => ({
    ...createContactSchema.parse(item),
    tenantId,
  }))

  const result = await prisma.contact.createMany({
    data: validated,
    skipDuplicates: true,
  })

  logger.info({ tenantId, count: result.count }, 'Bulk contacts imported')
  return c.json({ imported: result.count, total: items.length })
})

// ═══ GET /:id/activities — Activity timeline ═══
contacts.get('/:id/activities', async (c) => {
  const { tenantId } = getTenant(c)
  const contactId = c.req.param('id')

  const existing = await prisma.contact.findFirst({ where: { id: contactId, tenantId } })
  if (!existing) throw new NotFoundError('Contact')

  const activities = await prisma.activity.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return c.json({ data: activities })
})

// ═══ POST /:id/tags — Add tag to contact ═══
contacts.post('/:id/tags', async (c) => {
  const { tenantId } = getTenant(c)
  const contactId = c.req.param('id')
  const { tagName, tagColor = '#6366f1' } = await c.req.json() as { tagName: string; tagColor?: string }

  const existing = await prisma.contact.findFirst({ where: { id: contactId, tenantId } })
  if (!existing) throw new NotFoundError('Contact')

  // Upsert tag
  const tag = await prisma.tag.upsert({
    where: { tenantId_name: { tenantId, name: tagName } },
    create: { tenantId, name: tagName, color: tagColor },
    update: {},
  })

  // Link contact to tag
  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    create: { contactId, tagId: tag.id },
    update: {},
  })

  return c.json({ data: tag })
})

// ═══ DELETE /:id/tags/:tagId — Remove tag ═══
contacts.delete('/:id/tags/:tagId', async (c) => {
  const { tenantId } = getTenant(c)
  const contactId = c.req.param('id')
  const tagId = c.req.param('tagId')

  const existing = await prisma.contact.findFirst({ where: { id: contactId, tenantId } })
  if (!existing) throw new NotFoundError('Contact')

  await prisma.contactTag.delete({
    where: { contactId_tagId: { contactId, tagId } },
  }).catch(() => {}) // Ignore if not found

  return c.json({ success: true })
})

export { contacts as contactRoutes }
