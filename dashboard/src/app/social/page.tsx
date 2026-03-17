import { hubFetch } from '@/lib/hub'
import { SocialCalendar } from './calendar'

async function getAccounts() {
  try {
    const res = await hubFetch('/services/execute', {
      method: 'POST',
      body: JSON.stringify({ service: 'getlate', action: 'list_accounts', params: {} }),
    })
    return res.data?.data?.accounts || []
  } catch {
    return null
  }
}

async function getPosts() {
  try {
    const res = await hubFetch('/services/execute', {
      method: 'POST',
      body: JSON.stringify({ service: 'getlate', action: 'list_posts', params: { limit: 50 } }),
    })
    const data = res.data?.data
    return data?.posts || data?.data || []
  } catch {
    return []
  }
}

export default async function SocialPage() {
  const [accounts, posts] = await Promise.all([getAccounts(), getPosts()])

  if (accounts === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface-light border border-border rounded-2xl p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-lighter flex items-center justify-center text-3xl mx-auto mb-5">
            🔗
          </div>
          <h2 className="text-lg font-semibold mb-2">getLate no configurado</h2>
          <p className="text-text-muted text-sm leading-relaxed">
            Conecta tu cuenta de getLate en Configuración para gestionar tus redes sociales desde aquí.
          </p>
        </div>
      </div>
    )
  }

  return <SocialCalendar initialAccounts={accounts} initialPosts={posts} />
}
