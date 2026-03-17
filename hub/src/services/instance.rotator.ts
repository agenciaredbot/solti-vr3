/**
 * Instance Rotator — Round-robin assignment of WhatsApp instances.
 *
 * Assigns messages to connected instances in rotation.
 * If one instance goes down, all traffic goes to the other.
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

// Per-campaign rotation counters (in memory)
const rotationCounters = new Map<string, number>()

/**
 * Get the next available instance for a campaign using round-robin.
 * Returns instanceName or null if no instances are connected.
 */
export async function getNextInstance(
  tenantId: string,
  campaignId: string,
  preferredInstanceIds?: string[]
): Promise<string | null> {
  // Get connected instances for this tenant
  const where: Record<string, unknown> = {
    tenantId,
    status: 'CONNECTED',
  }

  // If campaign specifies preferred instances, filter to those
  if (preferredInstanceIds?.length) {
    where.id = { in: preferredInstanceIds }
  }

  const instances = await prisma.whatsappInstance.findMany({
    where,
    select: { instanceName: true },
    orderBy: { instanceName: 'asc' }, // Deterministic order
  })

  if (instances.length === 0) {
    logger.warn({ tenantId, campaignId }, 'No connected WhatsApp instances available')
    return null
  }

  // Round-robin
  const counter = (rotationCounters.get(campaignId) || 0)
  const index = counter % instances.length
  rotationCounters.set(campaignId, counter + 1)

  return instances[index].instanceName
}

/**
 * Reset rotation counter for a campaign (e.g., when campaign completes).
 */
export function resetRotation(campaignId: string): void {
  rotationCounters.delete(campaignId)
}
