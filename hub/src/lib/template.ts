/**
 * Template Personalization Engine
 *
 * Replaces {field} placeholders with contact data.
 * Supports nested access: {customFields.rating}
 */

import type { Prisma } from '@prisma/client'

export interface TemplateContext {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  company?: string | null
  city?: string | null
  country?: string | null
  website?: string | null
  source?: string | null
  score?: number | null
  customFields?: Prisma.JsonValue
  // Campaign context
  campaignName?: string
  stepNumber?: number
  senderName?: string
  senderCompany?: string
}

const DEFAULT_VALUES: Record<string, string> = {
  firstName: 'Estimado/a',
  lastName: '',
  company: 'su empresa',
  city: 'su ciudad',
  country: 'Colombia',
  senderName: 'Redbot',
  senderCompany: 'Redbot',
}

/**
 * Replace {field} placeholders with context values.
 * Unresolved placeholders use default values or empty string.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  let result = template

  // Flatten context
  const flat: Record<string, string> = {}

  for (const [key, value] of Object.entries(ctx)) {
    if (key === 'customFields' && typeof value === 'object' && value !== null) {
      for (const [cfKey, cfVal] of Object.entries(value as Record<string, unknown>)) {
        flat[`customFields.${cfKey}`] = String(cfVal ?? '')
        flat[cfKey] = String(cfVal ?? '') // Also allow direct access
      }
    } else {
      flat[key] = value != null ? String(value) : ''
    }
  }

  // Derived fields
  flat.fullName = [flat.firstName, flat.lastName].filter(Boolean).join(' ') || DEFAULT_VALUES.firstName
  flat.name = flat.firstName || DEFAULT_VALUES.firstName

  // Replace placeholders
  result = result.replace(/\{(\w+(?:\.\w+)?)\}/g, (match, key) => {
    return flat[key] ?? DEFAULT_VALUES[key] ?? ''
  })

  // Also handle {{ field }} (Jinja-style)
  result = result.replace(/\{\{\s*(\w+(?:\.\w+)?)\s*\}\}/g, (match, key) => {
    return flat[key] ?? DEFAULT_VALUES[key] ?? ''
  })

  return result
}

/**
 * Find unresolved placeholders in a template.
 */
export function findPlaceholders(template: string): string[] {
  const matches = new Set<string>()
  const regex = /\{(\w+(?:\.\w+)?)\}/g
  let match
  while ((match = regex.exec(template)) !== null) {
    matches.add(match[1])
  }
  const jinjaRegex = /\{\{\s*(\w+(?:\.\w+)?)\s*\}\}/g
  while ((match = jinjaRegex.exec(template)) !== null) {
    matches.add(match[1])
  }
  return Array.from(matches)
}
