/**
 * Credit Service — Balance management, deductions, purchases, plan resets.
 *
 * Credit Model:
 * - Each tenant has a CreditBalance: planCredits + purchasedCredits - usedCredits
 * - Plan credits reset monthly (plan_reset transaction)
 * - Purchased credits carry over (never expire)
 * - Deductions happen when using PLATFORM keys (not OWN_KEY)
 * - Transactions log every credit change
 *
 * Plan credit allocations:
 *   free: 10, pro: 50, growth: 200, agency: 500
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

// ═══ Plan definitions ═══

export const PLAN_CREDITS: Record<string, number> = {
  free: 10,
  pro: 50,
  growth: 200,
  agency: 500,
}

export const CREDIT_PACKAGES = [
  { id: 'credits_10', credits: 10, priceUsd: 2, perCredit: 0.20 },
  { id: 'credits_100', credits: 100, priceUsd: 10, perCredit: 0.10 },
  { id: 'credits_500', credits: 500, priceUsd: 40, perCredit: 0.08 },
  { id: 'credits_2000', credits: 2000, priceUsd: 120, perCredit: 0.06 },
] as const

// Service action credit costs (when using PLATFORM keys)
export const ACTION_COSTS: Record<string, Record<string, number>> = {
  apify: {
    scrapeGoogleMaps: 5,   // ~100 leads
    scrapeLinkedIn: 3,
    scrapeInstagram: 2,
    default: 2,
  },
  brevo: {
    send_email: 1,          // per batch of ~50 emails
    default: 1,
  },
  evolution: {
    send_text: 0,           // WA via their own instance, no credit cost
    send_media: 0,
    default: 0,
  },
  getlate: {
    create_post: 1,
    default: 1,
  },
}

// ═══ Core functions ═══

/**
 * Get or create a tenant's credit balance.
 */
export async function getBalance(tenantId: string) {
  let balance = await prisma.creditBalance.findUnique({
    where: { tenantId },
  })

  if (!balance) {
    // Get tenant plan to determine initial credits
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    })
    const plan = tenant?.plan || 'free'
    const planCredits = PLAN_CREDITS[plan] ?? 10

    balance = await prisma.creditBalance.create({
      data: {
        tenantId,
        planCredits,
        purchasedCredits: 0,
        usedCredits: 0,
        resetsAt: getNextResetDate(),
      },
    })
  }

  return {
    ...balance,
    available: balance.planCredits + balance.purchasedCredits - balance.usedCredits,
  }
}

/**
 * Check if tenant has enough credits for an action.
 */
export async function hasCredits(tenantId: string, service: string, action: string): Promise<boolean> {
  const cost = getActionCost(service, action)
  if (cost === 0) return true

  const balance = await getBalance(tenantId)
  return balance.available >= cost
}

/**
 * Deduct credits for a service action (PLATFORM key usage).
 * Returns false if insufficient credits.
 */
export async function deductCredits(
  tenantId: string,
  service: string,
  action: string,
  opts?: { jobId?: string; description?: string; realCostUsd?: number }
): Promise<{ success: boolean; remaining: number; cost: number }> {
  const cost = getActionCost(service, action)
  if (cost === 0) {
    const balance = await getBalance(tenantId)
    return { success: true, remaining: balance.available, cost: 0 }
  }

  const balance = await getBalance(tenantId)
  if (balance.available < cost) {
    return { success: false, remaining: balance.available, cost }
  }

  // Atomic update: increment usedCredits
  const updated = await prisma.creditBalance.update({
    where: { tenantId },
    data: { usedCredits: { increment: cost } },
  })

  const remaining = updated.planCredits + updated.purchasedCredits - updated.usedCredits

  // Log transaction
  await prisma.creditTransaction.create({
    data: {
      tenantId,
      type: 'deduct',
      amount: -cost,
      balanceAfter: remaining,
      service,
      action,
      realCostUsd: opts?.realCostUsd ?? null,
      description: opts?.description ?? `${service}/${action}`,
      jobId: opts?.jobId ?? null,
    },
  })

  logger.info({ tenantId, service, action, cost, remaining }, 'Credits deducted')
  return { success: true, remaining, cost }
}

/**
 * Add purchased credits (after Stripe payment).
 */
export async function addPurchasedCredits(
  tenantId: string,
  credits: number,
  description?: string
): Promise<{ balance: number }> {
  // Ensure balance exists
  await getBalance(tenantId)

  const updated = await prisma.creditBalance.update({
    where: { tenantId },
    data: { purchasedCredits: { increment: credits } },
  })

  const remaining = updated.planCredits + updated.purchasedCredits - updated.usedCredits

  await prisma.creditTransaction.create({
    data: {
      tenantId,
      type: 'purchase',
      amount: credits,
      balanceAfter: remaining,
      description: description ?? `Purchased ${credits} credits`,
    },
  })

  logger.info({ tenantId, credits, remaining }, 'Credits purchased')
  return { balance: remaining }
}

/**
 * Reset plan credits (called monthly by scheduler or Stripe webhook).
 */
export async function resetPlanCredits(
  tenantId: string,
  plan?: string
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  })
  const activePlan = plan || tenant?.plan || 'free'
  const planCredits = PLAN_CREDITS[activePlan] ?? 10

  const updated = await prisma.creditBalance.update({
    where: { tenantId },
    data: {
      planCredits,
      usedCredits: 0,
      resetsAt: getNextResetDate(),
    },
  })

  const remaining = updated.planCredits + updated.purchasedCredits - updated.usedCredits

  await prisma.creditTransaction.create({
    data: {
      tenantId,
      type: 'plan_reset',
      amount: planCredits,
      balanceAfter: remaining,
      description: `Monthly reset — ${activePlan} plan (${planCredits} credits)`,
    },
  })

  logger.info({ tenantId, plan: activePlan, planCredits }, 'Plan credits reset')
}

/**
 * Add bonus credits (manual, promo, refund).
 */
export async function addBonusCredits(
  tenantId: string,
  credits: number,
  reason: string
): Promise<{ balance: number }> {
  await getBalance(tenantId)

  const updated = await prisma.creditBalance.update({
    where: { tenantId },
    data: { purchasedCredits: { increment: credits } },
  })

  const remaining = updated.planCredits + updated.purchasedCredits - updated.usedCredits

  await prisma.creditTransaction.create({
    data: {
      tenantId,
      type: 'bonus',
      amount: credits,
      balanceAfter: remaining,
      description: reason,
    },
  })

  return { balance: remaining }
}

/**
 * Get transaction history for a tenant.
 */
export async function getTransactions(
  tenantId: string,
  opts?: { limit?: number; offset?: number; type?: string }
) {
  const where: any = { tenantId }
  if (opts?.type) where.type = opts.type

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    }),
    prisma.creditTransaction.count({ where }),
  ])

  return { data: transactions, total }
}

// ═══ Helpers ═══

export function getActionCost(service: string, action: string): number {
  const serviceCosts = ACTION_COSTS[service]
  if (!serviceCosts) return 0
  return serviceCosts[action] ?? serviceCosts.default ?? 0
}

function getNextResetDate(): Date {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return next
}
