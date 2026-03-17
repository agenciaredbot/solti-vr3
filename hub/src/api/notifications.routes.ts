/**
 * Notification Routes — Dashboard notification bell endpoints.
 *
 * GET    /              → List notifications (paginated, filterable)
 * GET    /unread-count  → Count of unread notifications
 * PATCH  /:id/read      → Mark one as read
 * PATCH  /read-all      → Mark all as read
 */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'

const notificationRoutes = new Hono()

// ═══ GET / — List notifications ═══
notificationRoutes.get('/', async (c) => {
  const { tenantId } = getTenant(c)
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const offset = parseInt(c.req.query('offset') || '0')
  const unreadOnly = c.req.query('unread') === 'true'

  const where: any = { tenantId }
  if (unreadOnly) where.read = false

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
  ])

  return c.json({ data: notifications, total, limit, offset })
})

// ═══ GET /unread-count — Badge count ═══
notificationRoutes.get('/unread-count', async (c) => {
  const { tenantId } = getTenant(c)
  const count = await prisma.notification.count({
    where: { tenantId, read: false },
  })
  return c.json({ count })
})

// ═══ PATCH /read-all — Mark all as read ═══
notificationRoutes.patch('/read-all', async (c) => {
  const { tenantId } = getTenant(c)
  const { count } = await prisma.notification.updateMany({
    where: { tenantId, read: false },
    data: { read: true, readAt: new Date() },
  })
  return c.json({ updated: count })
})

// ═══ PATCH /:id/read — Mark one as read ═══
notificationRoutes.patch('/:id/read', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  await prisma.notification.updateMany({
    where: { id, tenantId },
    data: { read: true, readAt: new Date() },
  })

  return c.json({ ok: true })
})

export { notificationRoutes }
