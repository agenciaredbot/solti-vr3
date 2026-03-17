/**
 * Recipient Resolver — Shared service for resolving campaign recipients.
 *
 * Supports 3 modes:
 * 1. By list — Members of an existing ContactList
 * 2. By filters — Dynamic query (tags, scoreMin, status, city, customFields)
 * 3. Combined — List members that ALSO match filters (AND logic)
 *
 * Used by WhatsApp campaigns, email campaigns, and any future channel.
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

export interface RecipientFilters {
  tags?: string[]
  scoreMin?: number
  status?: string[]
  city?: string
  country?: string
  customFields?: Record<string, unknown>
}

export interface RecipientConfig {
  listId?: string
  filters?: RecipientFilters
}

export interface ResolvedRecipient {
  contactId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  city: string | null
  country: string | null
  website: string | null
  score: number
  customFields: unknown
}

/**
 * Resolve recipients from a list, filters, or both.
 * Returns deduplicated contacts matching the criteria.
 */
export async function resolveRecipients(
  tenantId: string,
  config: RecipientConfig
): Promise<ResolvedRecipient[]> {
  const { listId, filters } = config

  if (!listId && !filters) {
    throw new Error('RecipientResolver: must provide listId, filters, or both')
  }

  // Build Prisma where clause for filters
  const filterWhere = buildFilterWhere(tenantId, filters)

  let contactIds: Set<string> | null = null

  // Step 1: Get list member IDs if listId provided
  if (listId) {
    const members = await prisma.listMember.findMany({
      where: { listId },
      select: { contactId: true },
    })
    contactIds = new Set(members.map(m => m.contactId))

    if (contactIds.size === 0) {
      logger.info({ tenantId, listId }, 'RecipientResolver: list has no members')
      return []
    }
  }

  // Step 2: Query contacts with filters
  const where: Record<string, unknown> = { ...filterWhere }

  // If we have list IDs, add them as an AND condition
  if (contactIds) {
    where.id = { in: Array.from(contactIds) }
  }

  const contacts = await prisma.contact.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      whatsapp: true,
      city: true,
      country: true,
      website: true,
      score: true,
      customFields: true,
    },
  })

  logger.info(
    { tenantId, listId, hasFilters: !!filters, resolved: contacts.length },
    'RecipientResolver: recipients resolved'
  )

  return contacts.map(c => ({
    contactId: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    city: c.city,
    country: c.country,
    website: c.website,
    score: c.score,
    customFields: c.customFields,
  }))
}

/**
 * Resolve recipients and filter only those with valid WhatsApp numbers.
 * Also excludes blacklisted numbers.
 */
export async function resolveWhatsappRecipients(
  tenantId: string,
  config: RecipientConfig
): Promise<ResolvedRecipient[]> {
  const all = await resolveRecipients(tenantId, config)

  // Get blacklisted phones for this tenant
  const blacklisted = await prisma.whatsappBlacklist.findMany({
    where: { tenantId },
    select: { phone: true },
  })
  const blacklistSet = new Set(blacklisted.map(b => b.phone))

  const valid = all.filter(r => {
    const phone = normalizePhone(r.whatsapp || r.phone)
    if (!phone) return false
    if (blacklistSet.has(phone)) return false
    return true
  })

  const excluded = all.length - valid.length
  if (excluded > 0) {
    logger.info(
      { tenantId, total: all.length, valid: valid.length, excluded },
      'RecipientResolver: excluded recipients (no phone or blacklisted)'
    )
  }

  return valid
}

/**
 * Normalize a phone number to digits only (Colombian format: 57XXXXXXXXXX).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  // Strip everything except digits
  let digits = phone.replace(/\D/g, '')
  // If starts with +, it was already stripped
  // Handle Colombian numbers
  if (digits.length === 10 && digits.startsWith('3')) {
    digits = '57' + digits
  }
  // Must be at least 10 digits
  if (digits.length < 10) return null
  return digits
}

/**
 * Build Prisma where clause from RecipientFilters.
 */
function buildFilterWhere(
  tenantId: string,
  filters?: RecipientFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId }

  if (!filters) return where

  if (filters.status?.length) {
    where.status = { in: filters.status }
  }

  if (filters.scoreMin !== undefined) {
    where.score = { gte: filters.scoreMin }
  }

  if (filters.city) {
    where.city = { contains: filters.city, mode: 'insensitive' }
  }

  if (filters.country) {
    where.country = { contains: filters.country, mode: 'insensitive' }
  }

  if (filters.tags?.length) {
    // Contacts that have ALL specified tags
    where.contactTags = {
      some: {
        tag: {
          name: { in: filters.tags },
          tenantId,
        },
      },
    }
  }

  if (filters.customFields && Object.keys(filters.customFields).length > 0) {
    // Use Prisma JSON path filter
    for (const [key, value] of Object.entries(filters.customFields)) {
      where.customFields = {
        ...((where.customFields as Record<string, unknown>) || {}),
        path: [key],
        equals: value,
      }
    }
  }

  return where
}
