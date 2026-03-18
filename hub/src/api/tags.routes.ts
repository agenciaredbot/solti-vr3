/**
 * Tags API — Manage contact tags.
 *
 * GET    /       List all tags with contact count
 * POST   /       Create a tag
 * DELETE /:id    Delete a tag
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'

const tags = new Hono()

// ═══ GET / — List all tags ═══
tags.get('/', async (c) => {
  const { tenantId } = getTenant(c)

  const result = await prisma.tag.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { contactTags: true } },
    },
  })

  return c.json({ data: result })
})

// ═══ POST / — Create tag ═══
tags.post('/', async (c) => {
  const { tenantId } = getTenant(c)
  const body = z.object({
    name: z.string().min(1).max(50),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  }).parse(await c.req.json())

  const tag = await prisma.tag.upsert({
    where: { tenantId_name: { tenantId, name: body.name } },
    create: { tenantId, name: body.name, color: body.color },
    update: { color: body.color },
  })

  return c.json({ data: tag }, 201)
})

// ═══ DELETE /:id — Delete tag ═══
tags.delete('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const tagId = c.req.param('id')

  await prisma.tag.deleteMany({
    where: { id: tagId, tenantId },
  })

  return c.json({ success: true })
})

export { tags as tagRoutes }
