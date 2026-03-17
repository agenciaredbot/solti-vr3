/**
 * Stripe Webhook — Handles subscription and credit purchase events.
 *
 * Events handled:
 * - checkout.session.completed  → New subscription or credit purchase
 * - invoice.paid                → Recurring payment success → reset credits
 * - invoice.payment_failed      → Payment failed → warn tenant
 * - customer.subscription.updated → Plan change (up/downgrade)
 * - customer.subscription.deleted → Cancellation → downgrade to free
 *
 * Setup: stripe listen --forward-to localhost:4000/webhooks/stripe
 */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { addPurchasedCredits, resetPlanCredits, PLAN_CREDITS, CREDIT_PACKAGES } from '../services/credit.service.js'
import { sendNotification } from '../services/notification.service.js'

const stripeWebhook = new Hono()

// ═══ POST / — Receive Stripe webhook ═══
stripeWebhook.post('/', async (c) => {
  const sig = c.req.header('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event: any

  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && !webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET not configured in production — rejecting webhook')
    return c.json({ error: 'Webhook not configured' }, 500)
  }

  if (webhookSecret) {
    // Verify signature (required in production)
    if (!sig) {
      logger.warn('Stripe webhook missing signature header')
      return c.json({ error: 'Missing signature' }, 400)
    }
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
      const body = await c.req.text()
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Stripe webhook signature verification failed')
      return c.json({ error: 'Invalid signature' }, 400)
    }
  } else {
    // Dev mode only — no signature verification
    logger.warn('Stripe webhook running WITHOUT signature verification (dev mode)')
    event = await c.req.json()
  }

  const type = event.type as string
  logger.info({ type, id: event.id }, 'Stripe webhook received')

  try {
    switch (type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object)
        break
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object)
        break
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object)
        break
      default:
        logger.debug({ type }, 'Unhandled Stripe event')
    }
  } catch (err) {
    logger.error({ err, type }, 'Stripe webhook processing error')
  }

  return c.json({ received: true })
})

// ═══ Event handlers ═══

async function handleCheckoutCompleted(session: any): Promise<void> {
  const tenantId = session.metadata?.tenantId
  if (!tenantId) {
    logger.warn({ sessionId: session.id }, 'Checkout missing tenantId metadata')
    return
  }

  const mode = session.mode // 'subscription' or 'payment'

  if (mode === 'subscription') {
    // New subscription — create/update subscription record
    const subscriptionId = session.subscription as string
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
    const sub = await stripe.subscriptions.retrieve(subscriptionId) as any

    const priceId = sub.items.data[0]?.price?.id
    const plan = getPlanFromPriceId(priceId)

    await prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId || '',
        status: sub.status,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
      update: {
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId || '',
        status: sub.status,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
    })

    // Update tenant plan
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan, stripeCustomerId: session.customer as string },
    })

    // Reset credits for new plan
    await resetPlanCredits(tenantId, plan)

    logger.info({ tenantId, plan, subscriptionId }, 'Subscription activated')

  } else if (mode === 'payment') {
    // One-time credit purchase
    const packageId = session.metadata?.packageId
    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)

    if (pkg) {
      await addPurchasedCredits(tenantId, pkg.credits, `Compra: ${pkg.credits} creditos ($${pkg.priceUsd})`)
      logger.info({ tenantId, credits: pkg.credits }, 'Credit purchase completed')

      await sendNotification({
        tenantId,
        type: 'DAILY_REPORT',
        priority: 'NORMAL',
        channel: 'BOTH',
        title: 'Creditos agregados',
        body: `${pkg.credits} creditos agregados a tu cuenta.`,
      })
    }
  }
}

async function handleInvoicePaid(invoice: any): Promise<void> {
  const subscriptionId = invoice.subscription as string
  if (!subscriptionId) return

  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    include: { tenant: { select: { id: true, plan: true } } },
  })

  if (!sub) return

  // Reset monthly credits on recurring payment
  await resetPlanCredits(sub.tenantId, sub.tenant.plan)

  // Update subscription period
  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId) as any

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
    },
  })

  logger.info({ tenantId: sub.tenantId }, 'Invoice paid — credits reset')
}

async function handleInvoiceFailed(invoice: any): Promise<void> {
  const subscriptionId = invoice.subscription as string
  if (!subscriptionId) return

  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  })

  if (!sub) return

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'past_due' },
  })

  await sendNotification({
    tenantId: sub.tenantId,
    type: 'DAILY_REPORT',
    priority: 'CRITICAL',
    channel: 'BOTH',
    title: 'Pago fallido',
    body: 'Tu pago mensual fallo. Actualiza tu metodo de pago para evitar perder acceso.',
    actionUrl: '/billing',
  })

  logger.warn({ tenantId: sub.tenantId, subscriptionId }, 'Invoice payment failed')
}

async function handleSubscriptionUpdated(subscription: any): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  })

  if (!sub) return

  const priceId = subscription.items.data[0]?.price?.id
  const plan = getPlanFromPriceId(priceId)

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      stripePriceId: priceId || sub.stripePriceId,
      status: subscription.status,
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    },
  })

  // Update tenant plan
  await prisma.tenant.update({
    where: { id: sub.tenantId },
    data: { plan },
  })

  // Reset credits for new plan tier
  await resetPlanCredits(sub.tenantId, plan)

  logger.info({ tenantId: sub.tenantId, plan }, 'Subscription updated')
}

async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  })

  if (!sub) return

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'canceled' },
  })

  // Downgrade to free
  await prisma.tenant.update({
    where: { id: sub.tenantId },
    data: { plan: 'free' },
  })

  await resetPlanCredits(sub.tenantId, 'free')

  await sendNotification({
    tenantId: sub.tenantId,
    type: 'DAILY_REPORT',
    priority: 'HIGH',
    channel: 'BOTH',
    title: 'Suscripcion cancelada',
    body: 'Tu suscripcion fue cancelada. Tu cuenta ahora es Free con 10 creditos mensuales.',
    actionUrl: '/billing',
  })

  logger.info({ tenantId: sub.tenantId }, 'Subscription canceled — downgraded to free')
}

// ═══ Helpers ═══

const PRICE_TO_PLAN: Record<string, string> = {
  // Populate these from env or constants
  [process.env.STRIPE_PRICE_PRO || 'price_pro']: 'pro',
  [process.env.STRIPE_PRICE_GROWTH || 'price_growth']: 'growth',
  [process.env.STRIPE_PRICE_AGENCY || 'price_agency']: 'agency',
}

function getPlanFromPriceId(priceId?: string): string {
  if (!priceId) return 'free'
  return PRICE_TO_PLAN[priceId] || 'free'
}

export { stripeWebhook }
