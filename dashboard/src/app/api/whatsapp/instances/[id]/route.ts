/**
 * WhatsApp Instance — Get, Update, Delete
 *
 * GET    /api/whatsapp/instances/:id
 * PATCH  /api/whatsapp/instances/:id
 * DELETE /api/whatsapp/instances/:id
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
    })

    if (!instance) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ data: instance })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getAuthContext()
    const { id } = await params
    const body = await req.json()

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
    })

    if (!instance) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Allowed fields to update
    const allowedFields = [
      'autoReply', 'systemPrompt', 'additionalContext',
      'maxHistoryMsgs', 'maxTokens', 'fallbackMsg', 'cooldownSecs',
      'displayName',
    ]

    const updateData: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const updated = await prisma.whatsappInstance.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ data: updated })
  } catch (err: any) {
    console.error('[WhatsApp] Update error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getAuthContext()
    const { id } = await params

    const instance = await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
    })

    if (!instance) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Delete from Evolution
    try {
      await evo.deleteInstance(instance.instanceName)
    } catch {
      // May already be deleted in Evolution
    }

    // Delete from DB
    await prisma.whatsappInstance.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
