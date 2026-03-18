import { hubFetch } from '@/lib/hub'
import { InstanceConfig } from './instance-config'

async function getInstance(id: string) {
  try { return await hubFetch(`/whatsapp/instances/${id}`) } catch { return null }
}

export default async function InstanceConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getInstance(id)
  const instance = res?.data || res

  if (!instance) {
    return <p className="text-text-muted p-8">Instancia no encontrada</p>
  }

  return <InstanceConfig initialInstance={instance} />
}
