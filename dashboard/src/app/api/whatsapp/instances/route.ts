/**
 * WhatsApp Instances — List and Create
 *
 * GET  /api/whatsapp/instances     — List all instances
 * POST /api/whatsapp/instances     — Create new instance
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth-api'
import * as evo from '@/lib/evolution'

export async function GET() {
  try {
    const { tenantId } = await getAuthContext()

    const instances = await prisma.whatsappInstance.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: instances })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await getAuthContext()
    const body = await req.json()
    const { name } = body

    if (!name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    // Get tenant slug for instance naming
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    })

    const slug = tenant?.slug || 'default'
    const instanceName = `solti-${slug}-${name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)

    // Webhook URL = this Vercel app
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3001'
    const webhookUrl = `${baseUrl}/api/webhooks/whatsapp`

    // Create in Evolution with webhook built-in
    const result = await evo.createInstance(instanceName, webhookUrl)
    const instanceId = result.instance?.instanceId || null

    // Store in DB
    const instance = await prisma.whatsappInstance.create({
      data: {
        tenantId,
        instanceName,
        instanceId,
        status: 'CONNECTING',
        webhookUrl,
      },
    })

    return NextResponse.json({
      data: instance,
      qrcode: result.qrcode?.base64 || null,
    })
  } catch (err: any) {
    console.error('[WhatsApp] Create instance error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
