/**
 * Auth middleware for Hono.
 *
 * Resolves tenant from:
 * 1. Plugin API key (X-Api-Key header) → tenant_configs.plugin_api_key
 * 2. Supabase JWT (Authorization: Bearer) → tenant_members.user_id
 */

import type { Context, Next } from 'hono'
import { jwtVerify } from 'jose'
import { prisma } from '../lib/prisma.js'
import { AuthError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

// Supabase JWT secret for signature verification
// Get this from Supabase Dashboard > Settings > API > JWT Secret
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET
const JWT_SECRET = SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(SUPABASE_JWT_SECRET)
  : null

if (!JWT_SECRET) {
  logger.warn('SUPABASE_JWT_SECRET not set — JWT verification will use Supabase API fallback (slower)')
}

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
 * VERIFIES signature before trusting payload, then looks up tenant_members.
 */
async function resolveFromJwt(token: string): Promise<TenantContext | null> {
  try {
    let userId: string | undefined

    if (JWT_SECRET) {
      // Fast path: verify JWT signature locally
      const { payload } = await jwtVerify(token, JWT_SECRET, {
        issuer: 'supabase',
      })
      userId = payload.sub as string | undefined
    } else {
      // Fallback: verify token via Supabase API (slower but secure)
      const supabaseUrl = process.env.SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_KEY
      if (!supabaseUrl || !serviceKey) return null

      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': serviceKey,
        },
      })
      if (!res.ok) return null
      const user = await res.json() as { id?: string }
      userId = user.id
    }

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
