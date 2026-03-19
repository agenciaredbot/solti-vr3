/**
 * Auth helper for API routes — resolves tenantId from Supabase session or API key.
 */
import { prisma } from './prisma'
import { createClient } from './supabase/server'

export interface AuthContext {
  tenantId: string
  userId?: string
}

/**
 * Resolve tenant from current request context.
 * Works in API route handlers (uses cookies for Supabase session).
 */
export async function getAuthContext(): Promise<AuthContext> {
  // Try Supabase session first
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user?.id) {
      // Find tenant membership
      const member = await prisma.tenantMember.findFirst({
        where: { userId: user.id },
        select: { tenantId: true },
      })

      if (member) {
        return { tenantId: member.tenantId, userId: user.id }
      }
    }
  } catch {
    // Session not available
  }

  throw new Error('Unauthorized')
}

/**
 * Get tenant for webhook routes (no auth needed, resolves by instanceName prefix).
 */
export async function getTenantByInstanceName(instanceName: string): Promise<string | null> {
  // Instance names follow pattern: solti-{tenantSlug}-{name}
  const instance = await prisma.whatsappInstance.findFirst({
    where: { instanceName },
    select: { tenantId: true },
  })
  return instance?.tenantId || null
}
