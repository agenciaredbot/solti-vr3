/**
 * Analytics API — Usage stats and daily metrics.
 *
 * GET  /dashboard     Dashboard summary (key metrics)
 * GET  /usage         Usage logs (paginated)
 * GET  /metrics       Daily metrics (date range)
 * GET  /credits       Credit balance
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getTenant } from '../auth/middleware.js'

const analytics = new Hono()

// ═══ GET /dashboard — Dashboard summary ═══
analytics.get('/dashboard', async (c) => {
  const { tenantId } = getTenant(c)

  const [
    totalContacts,
    contactsByStatus,
    activeCampaigns,
    waInstances,
    recentJobs,
    creditBalance,
    todayMetrics,
  ] = await Promise.all([
    prisma.contact.count({ where: { tenantId } }),
    prisma.contact.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    }),
    prisma.campaign.count({ where: { tenantId, status: 'SENDING' } }),
    prisma.whatsappInstance.count({ where: { tenantId, status: 'CONNECTED' } }),
    prisma.job.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, status: true, progress: true, createdAt: true },
    }),
    prisma.creditBalance.findUnique({ where: { tenantId } }),
    prisma.dailyMetric.findFirst({
      where: {
        tenantId,
        date: new Date(new Date().toISOString().split('T')[0]),
      },
    }),
  ])

  return c.json({
    data: {
      contacts: {
        total: totalContacts,
        byStatus: Object.fromEntries(
          contactsByStatus.map(g => [g.status, g._count])
        ),
      },
      campaigns: { active: activeCampaigns },
      whatsapp: { connectedInstances: waInstances },
      recentJobs,
      credits: creditBalance
        ? {
            available: creditBalance.planCredits + creditBalance.purchasedCredits - creditBalance.usedCredits,
            plan: creditBalance.planCredits,
            purchased: creditBalance.purchasedCredits,
            used: creditBalance.usedCredits,
            resetsAt: creditBalance.resetsAt,
          }
        : null,
      today: todayMetrics || {
        leadsGenerated: 0,
        emailsSent: 0,
        dmsSent: 0,
        whatsappMessagesIn: 0,
        whatsappMessagesOut: 0,
        postsPublished: 0,
      },
    },
  })
})

// ═══ GET /usage — Usage logs ═══
analytics.get('/usage', async (c) => {
  const { tenantId } = getTenant(c)
  const page = Number(c.req.query('page') || 1)
  const limit = Math.min(Number(c.req.query('limit') || 25), 100)
  const service = c.req.query('service')

  const where: Record<string, unknown> = { tenantId }
  if (service) where.service = service

  const [logs, total] = await Promise.all([
    prisma.usageLog.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.usageLog.count({ where: where as any }),
  ])

  return c.json({
    data: logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
})

// ═══ GET /metrics — Daily metrics (date range) ═══
analytics.get('/metrics', async (c) => {
  const { tenantId } = getTenant(c)
  const from = c.req.query('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const to = c.req.query('to') || new Date().toISOString().split('T')[0]

  const metrics = await prisma.dailyMetric.findMany({
    where: {
      tenantId,
      date: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
    orderBy: { date: 'asc' },
  })

  // Compute totals
  const totals = metrics.reduce(
    (acc, m) => ({
      leadsGenerated: acc.leadsGenerated + m.leadsGenerated,
      leadsEnriched: acc.leadsEnriched + m.leadsEnriched,
      emailsSent: acc.emailsSent + m.emailsSent,
      emailsOpened: acc.emailsOpened + m.emailsOpened,
      dmsSent: acc.dmsSent + m.dmsSent,
      dmsReplied: acc.dmsReplied + m.dmsReplied,
      whatsappMessagesIn: acc.whatsappMessagesIn + m.whatsappMessagesIn,
      whatsappMessagesOut: acc.whatsappMessagesOut + m.whatsappMessagesOut,
      postsPublished: acc.postsPublished + m.postsPublished,
      totalCreditsUsed: acc.totalCreditsUsed + m.totalCreditsUsed,
    }),
    {
      leadsGenerated: 0, leadsEnriched: 0,
      emailsSent: 0, emailsOpened: 0,
      dmsSent: 0, dmsReplied: 0,
      whatsappMessagesIn: 0, whatsappMessagesOut: 0,
      postsPublished: 0, totalCreditsUsed: 0,
    }
  )

  return c.json({ data: metrics, totals, range: { from, to } })
})

// ═══ GET /credits — Credit balance ═══
analytics.get('/credits', async (c) => {
  const { tenantId } = getTenant(c)

  const balance = await prisma.creditBalance.findUnique({
    where: { tenantId },
  })

  const recentTransactions = await prisma.creditTransaction.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return c.json({
    data: {
      balance: balance
        ? {
            available: balance.planCredits + balance.purchasedCredits - balance.usedCredits,
            plan: balance.planCredits,
            purchased: balance.purchasedCredits,
            used: balance.usedCredits,
            resetsAt: balance.resetsAt,
          }
        : null,
      recentTransactions,
    },
  })
})

export { analytics as analyticsRoutes }
