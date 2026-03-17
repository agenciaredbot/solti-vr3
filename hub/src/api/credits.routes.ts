/**
 * Credit Routes — Balance, transactions, and package info.
 *
 * GET    /balance       → Current credit balance
 * GET    /transactions  → Transaction history
 * GET    /packages      → Available credit packages
 * POST   /bonus         → Add bonus credits (admin only, for now)
 */

import { Hono } from 'hono'
import { getTenant } from '../auth/middleware.js'
import {
  getBalance,
  getTransactions,
  addBonusCredits,
  CREDIT_PACKAGES,
  PLAN_CREDITS,
} from '../services/credit.service.js'

const creditRoutes = new Hono()

// ═══ GET /balance — Current balance ═══
creditRoutes.get('/balance', async (c) => {
  const { tenantId } = getTenant(c)
  const balance = await getBalance(tenantId)
  return c.json(balance)
})

// ═══ GET /transactions — History ═══
creditRoutes.get('/transactions', async (c) => {
  const { tenantId } = getTenant(c)
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
  const offset = parseInt(c.req.query('offset') || '0')
  const type = c.req.query('type') || undefined

  const result = await getTransactions(tenantId, { limit, offset, type })
  return c.json(result)
})

// ═══ GET /packages — Available credit packages ═══
creditRoutes.get('/packages', async (c) => {
  return c.json({
    packages: CREDIT_PACKAGES,
    planCredits: PLAN_CREDITS,
  })
})

// ═══ POST /bonus — Add bonus/refund credits ═══
creditRoutes.post('/bonus', async (c) => {
  const { tenantId } = getTenant(c)
  const body = await c.req.json() as { credits: number; reason: string }

  if (!body.credits || body.credits < 1 || body.credits > 10000) {
    return c.json({ error: 'credits must be between 1 and 10000' }, 400)
  }
  if (!body.reason) {
    return c.json({ error: 'reason is required' }, 400)
  }

  const result = await addBonusCredits(tenantId, body.credits, body.reason)
  return c.json(result)
})

export { creditRoutes }
