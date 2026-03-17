/**
 * Service Router — Resolves tenant credentials and routes to adapters.
 *
 * Credential resolution order:
 * 1. Check if tenant has OWN_KEY for this service → use it (no credit cost)
 * 2. Check if PLATFORM key exists for this service → use it + deduct credits
 * 3. Throw CredentialError
 *
 * Credit deduction only happens for PLATFORM key usage.
 */

import type { ServiceAdapter, AdapterResult } from '../adapters/adapter.interface.js'
import { ApifyAdapter } from '../adapters/apify.adapter.js'
import { BrevoAdapter } from '../adapters/brevo.adapter.js'
import { EvolutionAdapter } from '../adapters/evolution.adapter.js'
import { GetLateAdapter } from '../adapters/getlate.adapter.js'
import { getCredential, type ServiceName } from '../services/vault.service.js'
import { deductCredits, getActionCost, hasCredits } from '../services/credit.service.js'
import { CredentialError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'

// Adapter registry
const adapters: Record<string, ServiceAdapter> = {
  apify: new ApifyAdapter(),
  brevo: new BrevoAdapter(),
  evolution: new EvolutionAdapter(),
  getlate: new GetLateAdapter(),
}

// Platform keys from env (operator-owned API keys shared across tenants)
const PLATFORM_KEYS: Partial<Record<string, string>> = {
  apify: process.env.PLATFORM_APIFY_KEY,
  brevo: process.env.PLATFORM_BREVO_KEY,
  getlate: process.env.PLATFORM_GETLATE_KEY,
  // evolution: never platform — always tenant's own instance
}

export interface RouteRequest {
  tenantId: string
  service: ServiceName
  action: string
  params: Record<string, unknown>
}

export interface RouteResponse extends AdapterResult {
  service: string
  action: string
  credType?: 'OWN_KEY' | 'PLATFORM'
  creditsUsed?: number
}

/**
 * Route a service request:
 * 1. Try tenant's OWN_KEY → no credits
 * 2. Fall back to PLATFORM key → deduct credits
 * 3. Execute via adapter
 * 4. Log usage
 */
export async function routeService(req: RouteRequest): Promise<RouteResponse> {
  const adapter = adapters[req.service]
  if (!adapter) {
    throw new Error(`Unknown service: ${req.service}. Available: ${Object.keys(adapters).join(', ')}`)
  }

  // Resolve credential: OWN_KEY first, then PLATFORM
  let apiKey: string
  let credType: 'OWN_KEY' | 'PLATFORM' = 'OWN_KEY'

  try {
    apiKey = await getCredential(req.tenantId, req.service)
  } catch (err) {
    // No own key — try platform key
    const platformKey = PLATFORM_KEYS[req.service]
    if (!platformKey) {
      throw new CredentialError(req.service)
    }

    // Check credits before using platform key
    const cost = getActionCost(req.service, req.action)
    if (cost > 0) {
      const canAfford = await hasCredits(req.tenantId, req.service, req.action)
      if (!canAfford) {
        throw new Error(`Insufficient credits for ${req.service}/${req.action} (costs ${cost} credits). Purchase more credits or add your own API key.`)
      }
    }

    apiKey = platformKey
    credType = 'PLATFORM'
  }

  logger.info({
    tenantId: req.tenantId,
    service: req.service,
    action: req.action,
    credType,
  }, 'Routing service request')

  // Execute
  const result = await adapter.execute(apiKey, req.action, req.params)

  // Deduct credits only on PLATFORM key + successful execution
  let creditsUsed = 0
  if (credType === 'PLATFORM' && result.success) {
    const deduction = await deductCredits(req.tenantId, req.service, req.action, {
      realCostUsd: result.cost,
      description: `${req.service}/${req.action}`,
    })
    creditsUsed = deduction.cost
  }

  // Log usage to analytics
  try {
    await prisma.usageLog.create({
      data: {
        tenantId: req.tenantId,
        service: req.service,
        action: req.action,
        credType,
        creditsCost: creditsUsed,
        realCostUsd: result.cost ?? 0,
        durationMs: 0,
        success: result.success,
        errorMessage: result.success ? null : (result.description ?? null),
      },
    })
  } catch (logErr) {
    logger.warn({ err: logErr }, 'Failed to log usage')
  }

  logger.info({
    tenantId: req.tenantId,
    service: req.service,
    action: req.action,
    success: result.success,
    credType,
    creditsUsed,
  }, 'Service request completed')

  return {
    ...result,
    service: req.service,
    action: req.action,
    credType,
    creditsUsed,
  }
}

/**
 * Test a service credential for a tenant.
 */
export async function testService(
  tenantId: string,
  service: ServiceName
): Promise<boolean> {
  const adapter = adapters[service]
  if (!adapter) return false

  try {
    const apiKey = await getCredential(tenantId, service)
    return await adapter.testConnection(apiKey)
  } catch {
    return false
  }
}

/**
 * Get available actions for a service.
 */
export function getServiceActions(service: string): string[] {
  return adapters[service]?.getActions() || []
}

/**
 * List all available services.
 */
export function getAvailableServices(): string[] {
  return Object.keys(adapters)
}
