/**
 * POST /api/whatsapp/instances/:id/send — Send a message
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth-api'
import * as evo from '@/lib/evolution'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getAuthContext()
    const { id } = await params
    const body = await req.json()
    const { number, text } = body

    if (!number || !text) {
      return NextResponse.json({ error: 'number and text required' }, { status: 400 })
    }

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
      select: { instanceName: true, status: true },
    })

    if (!instance) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (instance.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'Instance not connected' }, { status: 400 })
    }

    const result = await evo.sendText(instance.instanceName, number, text)

    return NextResponse.json({ data: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
