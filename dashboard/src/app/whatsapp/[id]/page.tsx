import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth-api'
import { InstanceConfig } from './instance-config'

async function getInstance(id: string) {
  try {
    const { tenantId } = await getAuthContext()
    return await prisma.whatsappInstance.findFirst({
      where: { id, tenantId },
    })
  } catch {
    return null
  }
}

export default async function InstanceConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const instance = await getInstance(id)

  if (!instance) {
    return <p className="text-text-muted p-8">Instancia no encontrada</p>
  }

  return <InstanceConfig initialInstance={instance} />
}
