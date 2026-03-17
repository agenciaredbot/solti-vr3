import { hubFetch } from '@/lib/hub'
import { Badge } from '@/components/ui/badge'
import { CredentialActions } from './actions'

async function getCredentials() {
  try {
    return await hubFetch('/credentials')
  } catch {
    return { data: [] }
  }
}

async function getCredits() {
  try {
    return await hubFetch('/analytics/credits')
  } catch {
    return { data: {} }
  }
}

const SERVICE_INFO: Record<string, { icon: string; label: string; description: string }> = {
  apify: { icon: '🕷️', label: 'Apify', description: 'Web scraping & lead generation' },
  brevo: { icon: '📧', label: 'Brevo', description: 'Email campaigns & transactional' },
  evolution: { icon: '💬', label: 'Evolution API', description: 'WhatsApp Business integration' },
  getlate: { icon: '📱', label: 'getLate', description: 'Social media management' },
  phantombuster: { icon: '👻', label: 'PhantomBuster', description: 'LinkedIn automation' },
}

export default async function SettingsPage() {
  const [credsRes, creditsRes] = await Promise.all([getCredentials(), getCredits()])
  const credentials = credsRes.data || []
  const credits = creditsRes.data?.balance || creditsRes.data || {}

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-text-muted mt-1">Credenciales y ajustes del sistema</p>
      </div>

      {/* Credits */}
      <div className="bg-surface-light border border-border rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Plan & Créditos</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-text-muted text-sm">Disponibles</p>
            <p className="text-3xl font-bold text-accent-green">{credits.available ?? '—'}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Usados</p>
            <p className="text-3xl font-bold">{credits.used ?? 0}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Se renueva</p>
            <p className="text-lg font-medium">
              {credits.resetsAt ? new Date(credits.resetsAt).toLocaleDateString('es-CO') : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Credentials */}
      <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Credenciales API</h2>
          <CredentialActions />
        </div>

        <div className="divide-y divide-border">
          {credentials.map((cred: any) => {
            const info = SERVICE_INFO[cred.service] || { icon: '🔑', label: cred.service, description: '' }
            return (
              <div key={cred.id} className="flex items-center justify-between px-6 py-4 hover:bg-surface-lighter transition-colors">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{info.icon}</span>
                  <div>
                    <p className="font-medium">{info.label}</p>
                    <p className="text-xs text-text-muted">{info.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {cred.isValid === true && <Badge variant="success">Válida</Badge>}
                  {cred.isValid === false && <Badge variant="danger">Inválida</Badge>}
                  {cred.isValid === null && <Badge variant="warning">Sin verificar</Badge>}
                  <span className="text-xs text-text-muted">
                    {cred.lastTestedAt ? `Probada: ${new Date(cred.lastTestedAt).toLocaleDateString('es-CO')}` : 'Nunca probada'}
                  </span>
                </div>
              </div>
            )
          })}
          {credentials.length === 0 && (
            <div className="p-8 text-center text-text-muted">
              Sin credenciales configuradas. Usa <code className="bg-surface-lighter px-2 py-1 rounded text-sm">/connect</code> en Solti.
            </div>
          )}
        </div>
      </div>

      {/* Telegram Linking */}
      <div className="bg-surface-light border border-border rounded-xl p-6 mt-8">
        <h2 className="text-lg font-semibold mb-4">Telegram Notificaciones</h2>
        <p className="text-sm text-text-muted mb-4">
          Conecta tu Telegram para recibir alertas de campanas, instancias WhatsApp y leads calientes.
        </p>
        <div className="bg-surface rounded-lg p-4 space-y-3">
          <p className="text-sm">1. Abre nuestro bot: <a href="https://t.me/SoltiBot" target="_blank" className="text-accent-green hover:underline">@SoltiBot</a></p>
          <p className="text-sm">2. Genera un codigo de vinculacion (proximo: boton aqui)</p>
          <p className="text-sm">3. Envia <code className="bg-surface-lighter px-2 py-0.5 rounded text-xs">/start TU_CODIGO</code> al bot</p>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-surface-light border border-border rounded-xl p-6 mt-8">
        <h2 className="text-lg font-semibold mb-4">Sistema</h2>
        <div className="space-y-2 text-sm">
          <InfoRow label="Hub URL" value={process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:4000'} />
          <InfoRow label="Dashboard Version" value="1.0.0" />
          <InfoRow label="Next.js" value="16.1.6" />
          <InfoRow label="Entorno" value={process.env.NODE_ENV || 'development'} />
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-text-muted">{label}</span>
      <code className="bg-surface px-2 py-0.5 rounded text-xs">{value}</code>
    </div>
  )
}
