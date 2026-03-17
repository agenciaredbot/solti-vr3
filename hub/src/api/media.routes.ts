/**
 * Media API — File upload/management for campaign attachments.
 *
 * POST   /              Upload file (multipart/form-data)
 * GET    /              List media files
 * GET    /:id           Get media file details
 * DELETE /:id           Delete media file
 */

import { Hono } from 'hono'
import { getTenant } from '../auth/middleware.js'
import { uploadMedia, deleteMedia, listMedia, getMedia } from '../services/media.service.js'
import { NotFoundError } from '../lib/errors.js'

const media = new Hono()

// ═══ POST / — Upload file ═══
media.post('/', async (c) => {
  const { tenantId } = getTenant(c)

  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided. Send as multipart/form-data with field name "file"' }, 400)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await uploadMedia(tenantId, {
    buffer,
    mimetype: file.type,
    originalname: file.name,
  })

  return c.json({ data: result }, 201)
})

// ═══ GET / — List media files ═══
media.get('/', async (c) => {
  const { tenantId } = getTenant(c)
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  const files = await listMedia(tenantId, limit, offset)
  return c.json({ data: files })
})

// ═══ GET /:id — Get media file ═══
media.get('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  const file = await getMedia(tenantId, id)
  if (!file) throw new NotFoundError('Media file')

  return c.json({ data: file })
})

// ═══ DELETE /:id — Delete media file ═══
media.delete('/:id', async (c) => {
  const { tenantId } = getTenant(c)
  const id = c.req.param('id')

  await deleteMedia(tenantId, id)
  return c.json({ success: true })
})

export { media as mediaRoutes }
