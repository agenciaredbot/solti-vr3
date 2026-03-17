/**
 * Media Service — Upload/delete files to Supabase Storage.
 *
 * Bucket: solti-media
 * Path: {tenantId}/campaigns/{cuid}.{ext}
 *
 * Used by WhatsApp campaigns for sending images, videos, docs, audio.
 */

import { createClient } from '@supabase/supabase-js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { randomUUID } from 'node:crypto'

const BUCKET = 'solti-media'

const ALLOWED_TYPES: Record<string, { ext: string; maxSize: number; type: string }> = {
  'image/jpeg': { ext: 'jpg', maxSize: 5_000_000, type: 'IMAGE' },
  'image/png': { ext: 'png', maxSize: 5_000_000, type: 'IMAGE' },
  'image/webp': { ext: 'webp', maxSize: 5_000_000, type: 'IMAGE' },
  'video/mp4': { ext: 'mp4', maxSize: 16_000_000, type: 'VIDEO' },
  'application/pdf': { ext: 'pdf', maxSize: 10_000_000, type: 'DOCUMENT' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx', maxSize: 10_000_000, type: 'DOCUMENT',
  },
  'audio/mpeg': { ext: 'mp3', maxSize: 5_000_000, type: 'AUDIO' },
  'audio/ogg': { ext: 'ogg', maxSize: 5_000_000, type: 'AUDIO' },
}

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for media service')
  return createClient(url, key)
}

export interface UploadResult {
  id: string
  publicUrl: string
  type: string
  filename: string
  size: number
  mimeType: string
}

/**
 * Upload a file to Supabase Storage and register in DB.
 */
export async function uploadMedia(
  tenantId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string }
): Promise<UploadResult> {
  const typeInfo = ALLOWED_TYPES[file.mimetype]
  if (!typeInfo) {
    throw new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}`)
  }

  if (file.buffer.length > typeInfo.maxSize) {
    const maxMB = Math.round(typeInfo.maxSize / 1_000_000)
    throw new Error(`File too large: ${Math.round(file.buffer.length / 1_000_000)}MB. Max for ${typeInfo.type}: ${maxMB}MB`)
  }

  const fileId = randomUUID()
  const storagePath = `${tenantId}/campaigns/${fileId}.${typeInfo.ext}`

  const supabase = getSupabase()

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  // Save to DB
  const media = await prisma.mediaFile.create({
    data: {
      tenantId,
      filename: file.originalname,
      storagePath,
      publicUrl,
      mimeType: file.mimetype,
      size: file.buffer.length,
      type: typeInfo.type,
    },
  })

  logger.info({ tenantId, mediaId: media.id, type: typeInfo.type, size: file.buffer.length }, 'Media uploaded')

  return {
    id: media.id,
    publicUrl,
    type: typeInfo.type,
    filename: file.originalname,
    size: file.buffer.length,
    mimeType: file.mimetype,
  }
}

/**
 * Delete a media file from Storage and DB.
 */
export async function deleteMedia(tenantId: string, mediaId: string): Promise<void> {
  const media = await prisma.mediaFile.findFirst({
    where: { id: mediaId, tenantId },
  })
  if (!media) throw new Error('Media not found')

  const supabase = getSupabase()

  // Delete from Storage
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([media.storagePath])

  if (error) {
    logger.warn({ mediaId, error: error.message }, 'Failed to delete from storage, removing DB record anyway')
  }

  // Delete from DB
  await prisma.mediaFile.delete({ where: { id: mediaId } })
  logger.info({ tenantId, mediaId }, 'Media deleted')
}

/**
 * List media files for a tenant.
 */
export async function listMedia(tenantId: string, limit = 50, offset = 0) {
  return prisma.mediaFile.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })
}

/**
 * Get a single media file by ID.
 */
export async function getMedia(tenantId: string, mediaId: string) {
  return prisma.mediaFile.findFirst({
    where: { id: mediaId, tenantId },
  })
}
