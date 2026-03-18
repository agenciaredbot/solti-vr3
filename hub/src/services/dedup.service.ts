/**
 * Deduplication Service — Detect and merge duplicate contacts before import.
 *
 * Three-tier matching:
 * 1. Email (exact, case-insensitive) → high confidence
 * 2. Phone (normalized digits)       → high confidence
 * 3. Name + City (case-insensitive)  → low confidence
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

// ═══ Types ═══

export interface ContactCandidate {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  [key: string]: unknown
}

export interface DuplicateMatch {
  candidateIndex: number
  contactId: string
  matchType: 'email' | 'phone' | 'name_city'
  confidence: 'high' | 'low'
  existingContact: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    city: string | null
  }
}

// ═══ Core Functions ═══

/**
 * Find duplicates for a batch of candidate contacts within a tenant.
 * Optimized for batch: uses IN queries rather than per-candidate lookups.
 */
export async function findDuplicates(
  tenantId: string,
  candidates: ContactCandidate[]
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = []

  // Collect non-empty values for batch queries
  const emails = candidates
    .map((c, i) => ({ index: i, email: c.email?.trim().toLowerCase() }))
    .filter((e): e is { index: number; email: string } => !!e.email)

  const phones = candidates
    .map((c, i) => ({ index: i, phone: normalizePhone(c.phone) }))
    .filter((p): p is { index: number; phone: string } => !!p.phone)

  const nameCities = candidates
    .map((c, i) => ({
      index: i,
      firstName: c.firstName?.trim().toLowerCase(),
      city: c.city?.trim().toLowerCase(),
    }))
    .filter((nc): nc is { index: number; firstName: string; city: string } =>
      !!nc.firstName && !!nc.city
    )

  // 1. Batch email lookup
  if (emails.length > 0) {
    const emailValues = [...new Set(emails.map(e => e.email))]
    const existing = await prisma.contact.findMany({
      where: {
        tenantId,
        email: { in: emailValues, mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, city: true },
    })

    const emailMap = new Map(existing.map(c => [c.email?.toLowerCase(), c]))
    for (const { index, email } of emails) {
      const match = emailMap.get(email)
      if (match) {
        matches.push({
          candidateIndex: index,
          contactId: match.id,
          matchType: 'email',
          confidence: 'high',
          existingContact: match,
        })
      }
    }
  }

  // Track already-matched candidates to avoid double-reporting
  const matchedIndices = new Set(matches.map(m => m.candidateIndex))

  // 2. Batch phone lookup (for candidates not already matched by email)
  if (phones.length > 0) {
    const unmatchedPhones = phones.filter(p => !matchedIndices.has(p.index))
    if (unmatchedPhones.length > 0) {
      const existing = await prisma.contact.findMany({
        where: {
          tenantId,
          phone: { not: null },
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, city: true },
      })

      const phoneMap = new Map<string, typeof existing[0]>()
      for (const contact of existing) {
        const normalized = normalizePhone(contact.phone)
        if (normalized) phoneMap.set(normalized, contact)
      }

      for (const { index, phone } of unmatchedPhones) {
        const match = phoneMap.get(phone)
        if (match) {
          matchedIndices.add(index)
          matches.push({
            candidateIndex: index,
            contactId: match.id,
            matchType: 'phone',
            confidence: 'high',
            existingContact: match,
          })
        }
      }
    }
  }

  // 3. Name + City lookup (for candidates not already matched)
  if (nameCities.length > 0) {
    const unmatchedNameCities = nameCities.filter(nc => !matchedIndices.has(nc.index))
    if (unmatchedNameCities.length > 0) {
      const firstNames = [...new Set(unmatchedNameCities.map(nc => nc.firstName))]
      const cities = [...new Set(unmatchedNameCities.map(nc => nc.city))]

      const existing = await prisma.contact.findMany({
        where: {
          tenantId,
          firstName: { in: firstNames, mode: 'insensitive' },
          city: { in: cities, mode: 'insensitive' },
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, city: true },
      })

      for (const { index, firstName, city } of unmatchedNameCities) {
        const match = existing.find(
          c =>
            c.firstName?.toLowerCase() === firstName &&
            c.city?.toLowerCase() === city
        )
        if (match) {
          matches.push({
            candidateIndex: index,
            contactId: match.id,
            matchType: 'name_city',
            confidence: 'low',
            existingContact: match,
          })
        }
      }
    }
  }

  logger.info(
    { tenantId, candidates: candidates.length, duplicates: matches.length },
    'Dedup check completed'
  )

  return matches
}

/**
 * Merge new data into an existing contact.
 * Strategy: "fill empty fields" — only updates fields that are currently null/empty.
 * Never overwrites existing data.
 */
export async function mergeContact(
  tenantId: string,
  existingId: string,
  newData: Partial<ContactCandidate>
): Promise<{ updated: boolean; fieldsUpdated: string[] }> {
  const existing = await prisma.contact.findFirst({
    where: { id: existingId, tenantId },
  })
  if (!existing) return { updated: false, fieldsUpdated: [] }

  const fillableFields = [
    'email', 'phone', 'whatsapp', 'instagram', 'linkedin', 'tiktok',
    'website', 'city', 'country', 'notes',
  ] as const

  const updates: Record<string, unknown> = {}
  const fieldsUpdated: string[] = []

  for (const field of fillableFields) {
    const existingValue = (existing as any)[field]
    const newValue = newData[field]
    if ((!existingValue || existingValue === '') && newValue) {
      updates[field] = newValue
      fieldsUpdated.push(field)
    }
  }

  // Update score if new score is higher
  if (newData.score && typeof newData.score === 'number' && newData.score > (existing.score || 0)) {
    updates.score = newData.score
    fieldsUpdated.push('score')
  }

  if (fieldsUpdated.length === 0) {
    return { updated: false, fieldsUpdated: [] }
  }

  await prisma.contact.update({
    where: { id: existingId },
    data: updates,
  })

  // Log merge activity
  await prisma.activity.create({
    data: {
      tenantId,
      contactId: existingId,
      type: 'status_change',
      title: 'Contacto actualizado por merge',
      description: `Campos actualizados: ${fieldsUpdated.join(', ')}`,
      metadata: { mergedFields: fieldsUpdated, source: 'scraping_import' },
    },
  }).catch(() => {})

  return { updated: true, fieldsUpdated }
}

// ═══ Helpers ═══

/**
 * Normalize a phone number by stripping non-digit characters.
 * Removes common prefixes (+57, +1, etc.) for comparison.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return null

  // Remove common country codes for comparison
  if (digits.length > 10) {
    // Try removing common prefixes: +57 (Colombia), +1 (US), +34 (Spain), +52 (Mexico)
    for (const prefix of ['57', '1', '34', '52', '55', '54', '56']) {
      if (digits.startsWith(prefix) && digits.length - prefix.length >= 7) {
        return digits.slice(prefix.length)
      }
    }
  }

  return digits
}
