/**
 * Billing Routes — Stripe checkout sessions for subscriptions and credit purchases.
 *
 * POST /checkout/subscription  → Create subscription checkout
 * POST /checkout/credits       → Create credit purchase checkout
 * GET  /subscription           → Get current subscription status
 * POST /portal                 → Create Stripe customer portal session
 */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'
import { CREDIT_PACKAGES } from '../services/credit.service.js'

const billingRoutes = new Hono()

async function getStripe() {
  const Stripe = (await import('stripe')).default
  return new Stripe(process.env.STRIPE_SECRET_KEY || '')
}

// ═══ POST /checkout/subscription — Start subscription ═══
billingRoutes.post('/checkout/subscription', async (c) => {
  const { tenantId } = getTenant(c)
  const { priceId } = await c.req.json() as { priceId: string }

  if (!priceId) return c.json({ error: 'priceId is required' }, 400)

  const stripe = await getStripe()
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true, name: true, members: { select: { email: true }, take: 1 } },
  })

  // Get or create Stripe customer
  let customerId = tenant?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant?.members?.[0]?.email || undefined,
      name: tenant?.name || undefined,
      metadata: { tenantId },
    })
    customerId = customer.id
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customerId },
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.DASHBOARD_URL || 'http://localhost:3001'}/billing?success=true`,
    cancel_url: `${process.env.DASHBOARD_URL || 'http://localhost:3001'}/billing?canceled=true`,
    metadata: { tenantId },
  })

  return c.json({ url: session.url })
})

// ═══ POST /checkout/credits — Buy credit package ═══
billingRoutes.post('/checkout/credits', async (c) => {
  const { tenantId } = getTenant(c)
  const { packageId } = await c.req.json() as { packageId: string }

  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
  if (!pkg) return c.json({ error: 'Invalid package' }, 400)

  const stripe = await getStripe()
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true, name: true, members: { select: { email: true }, take: 1 } },
  })

  let customerId = tenant?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant?.members?.[0]?.email || undefined,
      name: tenant?.name || undefined,
      metadata: { tenantId },
    })
    customerId = customer.id
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customerId },
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${pkg.credits} Solti Credits`,
          description: `${pkg.credits} credits at $${pkg.perCredit}/each`,
        },
        unit_amount: pkg.priceUsd * 100, // cents
      },
      quantity: 1,
    }],
    success_url: `${process.env.DASHBOARD_URL || 'http://localhost:3001'}/billing?credits=purchased`,
    cancel_url: `${process.env.DASHBOARD_URL || 'http://localhost:3001'}/billing`,
    metadata: { tenantId, packageId: pkg.id },
  })

  return c.json({ url: session.url })
})

// ═══ GET /subscription — Current subscription ═══
billingRoutes.get('/subscription', async (c) => {
  const { tenantId } = getTenant(c)

  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
  })

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  })

  return c.json({
    plan: tenant?.plan || 'free',
    subscription: sub || null,
  })
})

// ═══ POST /portal — Stripe Customer Portal ═══
billingRoutes.post('/portal', async (c) => {
  const { tenantId } = getTenant(c)

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true },
  })

  if (!tenant?.stripeCustomerId) {
    return c.json({ error: 'No Stripe customer found. Subscribe to a plan first.' }, 400)
  }

  const stripe = await getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${process.env.DASHBOARD_URL || 'http://localhost:3001'}/billing`,
  })

  return c.json({ url: session.url })
})

export { billingRoutes }
