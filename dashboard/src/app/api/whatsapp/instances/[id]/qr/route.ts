/**
 * GET /api/whatsapp/instances/:id/qr — Get QR code from Evolution
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth-api'
import * as evo from '@/lib/evolution'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getAuthContext()
    const { id } = await params

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
      select: { instanceName: true, status: true },
    })

    if (!instance) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const result = await evo.getQRCode(instance.instanceName)

    return NextResponse.json({
      data: {
        instanceName: instance.instanceName,
        qrCode: result.base64 || result.code || null,
        status: instance.status,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
