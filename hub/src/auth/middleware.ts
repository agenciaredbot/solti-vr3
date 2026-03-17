/**
 * Auth middleware for Hono.
 *
 * Resolves tenant from:
 * 1. Plugin API key (X-Api-Key header) → tenant_configs.plugin_api_key
 * 2. Supabase JWT (Authorization: Bearer) → tenant_members.user_id
 */

import type { Context, Next } from 'hono'
import { prisma } from '../lib/prisma.js'
import { AuthError } from '../lib/errors.js'

export interface TenantContext {
  tenantId: string
  tenantSlug: string
  userId?: string
  role?: string
}

/**
 * Middleware: extracts tenant from request and sets it in context.
 */
export async function authMiddleware(c: Context, next: Next) {
  let tenant: TenantContext | null = null

  // 1. Try Plugin API key
  const apiKey = c.req.header('X-Api-Key')
  if (apiKey) {
    tenant = await resolveFromApiKey(apiKey)
  }

  // 2. Try Supabase JWT
  if (!tenant) {
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      tenant = await resolveFromJwt(token)
    }
  }

  if (!tenant) {
    throw new AuthError('No valid API key or auth token provided')
  }

  // Store tenant context for downstream handlers
  c.set('tenant', tenant)

  await next()
}

/**
 * Resolve tenant from plugin API key.
 */
async function resolveFromApiKey(apiKey: string): Promise<TenantContext | null> {
  const config = await prisma.tenantConfig.findUnique({
    where: { pluginApiKey: apiKey },
    include: { tenant: true },
  })

  if (!config) return null

  return {
    tenantId: config.tenantId,
    tenantSlug: config.tenant.slug,
    role: 'plugin',
  }
}

/**
 * Resolve tenant from Supabase JWT.
 * Extracts user_id from JWT payload, looks up tenant_members.
 */
async function resolveFromJwt(token: string): Promise<TenantContext | null> {
  try {
    // Decode JWT payload (Supabase JWTs are standard)
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    )
    const userId = payload.sub
    if (!userId) return null

    // Find tenant membership
    const member = await prisma.tenantMember.findFirst({
      where: { userId },
      include: { tenant: true },
    })

    if (!member) return null

    return {
      tenantId: member.tenantId,
      tenantSlug: member.tenant.slug,
      userId,
      role: member.role,
    }
  } catch {
    return null
  }
}

/**
 * Helper: get tenant context from Hono context.
 */
export function getTenant(c: Context): TenantContext {
  const tenant = c.get('tenant') as TenantContext | undefined
  if (!tenant) {
    throw new AuthError('Tenant context not found')
  }
  return tenant
}
