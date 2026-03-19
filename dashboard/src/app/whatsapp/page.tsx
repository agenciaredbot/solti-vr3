import Link from 'next/link'
import { hubFetch } from '@/lib/hub'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WhatsAppActions } from './actions'
import { syncInstances } from './server-actions'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  CONNECTED: 'success',
  CONNECTING: 'warning',
  DISCONNECTED: 'danger',
}

async function getInstances() {
  try {
    // Try direct DB query via server action (no Hub dependency)
    const syncResult = await syncInstances()
    if (syncResult?.error) {
      console.error('[WhatsApp Page] Sync error:', syncResult.error)
    }
    // Always fetch from DB via Prisma directly
    const { prisma } = await import('@/lib/prisma')
    const { getAuthContext } = await import('@/lib/auth-api')
    const { tenantId } = await getAuthContext()
    const instances = await prisma.whatsappInstance.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
    return { data: instances }
  } catch (e: any) {
    console.error('[WhatsApp Page] Error:', e.message)
    return { data: [] }
  }
}

export default async function WhatsAppPage() {
  const res = await getInstances()
  const instances = res.data || []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">WhatsApp</h1>
          <p className="text-text-muted text-sm mt-1">Instancias y conexiones de WhatsApp Business</p>
        </div>
        <WhatsAppActions />
      </div>

      {instances.length === 0 ? (
        <div className="bg-surface-light border border-border rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">💬</p>
          <h2 className="text-lg font-semibold mb-2">Sin instancias de WhatsApp</h2>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Crea tu primera instancia para conectar un número de WhatsApp y empezar a enviar mensajes automatizados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {instances.map((inst: any) => (
            <InstanceCard key={inst.id} instance={inst} />
          ))}
        </div>
      )}
    </div>
  )
}

function InstanceCard({ instance }: { instance: any }) {
  const phone = instance.phoneNumber || 'Sin vincular'
  const connected = instance.status === 'CONNECTED'

  return (
    <div className="bg-surface-light border border-border rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${connected ? 'bg-accent-green/20' : 'bg-surface-lighter'}`}>
            💬
          </div>
          <div>
            <h3 className="font-semibold text-sm">{instance.instanceName}</h3>
            <p className="text-text-muted text-xs">{phone}</p>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[instance.status] || 'default'}>
          {instance.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-text-muted">Creada</p>
          <p className="font-medium">{new Date(instance.createdAt).toLocaleDateString('es-CO')}</p>
        </div>
        {instance.connectedAt && (
          <div>
            <p className="text-text-muted">Conectada</p>
            <p className="font-medium">{new Date(instance.connectedAt).toLocaleDateString('es-CO')}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-auto pt-2 border-t border-border/50">
        <Link href={`/whatsapp/${instance.id}`}>
          <Button size="sm" variant="secondary">Configurar</Button>
        </Link>
        <WhatsAppActions instanceId={instance.id} instanceName={instance.instanceName} status={instance.status} />
      </div>
      {instance.autoReply && (
        <div className="flex items-center gap-1.5 text-[10px] text-accent-green">
          <span>●</span> Agente activo
        </div>
      )}
    </div>
  )
}
