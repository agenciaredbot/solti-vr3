import { hubFetch } from '@/lib/hub'
import { Badge } from '@/components/ui/badge'

async function getBalance() {
  try {
    return await hubFetch('/credits/balance')
  } catch {
    return { available: 0, planCredits: 0, purchasedCredits: 0, usedCredits: 0, resetsAt: null }
  }
}

async function getTransactions() {
  try {
    return await hubFetch('/credits/transactions?limit=20')
  } catch {
    return { data: [], total: 0 }
  }
}

async function getPackages() {
  try {
    return await hubFetch('/credits/packages')
  } catch {
    return { packages: [], planCredits: {} }
  }
}

const PLAN_DETAILS: Record<string, { name: string; price: string; features: string[] }> = {
  free: {
    name: 'Free',
    price: '$0/mes',
    features: ['50 leads/mes', '100 emails/mes', '10 creditos', 'Sin WhatsApp'],
  },
  pro: {
    name: 'Pro',
    price: '$29/mes',
    features: ['500 leads/mes', '2,000 emails/mes', '50 creditos', '1 instancia WA', '100 DMs/mes'],
  },
  growth: {
    name: 'Growth',
    price: '$79/mes',
    features: ['2,000 leads/mes', '10,000 emails/mes', '200 creditos', '3 instancias WA', '500 DMs/mes'],
  },
  agency: {
    name: 'Agency',
    price: '$199/mes',
    features: ['Leads ilimitados', 'Emails ilimitados', '500 creditos', '10 instancias WA', '2,000 DMs/mes'],
  },
  full_access: {
    name: 'Full Access',
    price: 'Admin',
    features: ['Sin limites', 'Todas las APIs', 'Creditos ilimitados', 'WhatsApp ilimitado', 'Acceso total'],
  },
}

export default async function BillingPage() {
  const [balance, txRes, packagesRes] = await Promise.all([
    getBalance(),
    getTransactions(),
    getPackages(),
  ])
  const transactions = txRes.data || []
  const packages = packagesRes.packages || []
  const currentPlan = 'free' // TODO: get from tenant

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Facturacion</h1>
        <p className="text-text-muted mt-1">Plan, creditos y transacciones</p>
      </div>

      {/* Current Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface-light border border-border rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Plan Actual</h2>
            <Badge variant="success">{PLAN_DETAILS[currentPlan]?.name || currentPlan}</Badge>
          </div>
          <p className="text-4xl font-bold text-accent-green mb-4">
            {PLAN_DETAILS[currentPlan]?.price || '$0/mes'}
          </p>
          <ul className="space-y-2">
            {PLAN_DETAILS[currentPlan]?.features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-text-muted">
                <span className="text-accent-green">✓</span> {f}
              </li>
            ))}
          </ul>
          <button className="mt-6 px-4 py-2 bg-accent-green text-black rounded-lg font-medium hover:opacity-90 transition-opacity">
            Mejorar plan
          </button>
        </div>

        {/* Credits Summary */}
        <div className="bg-surface-light border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Creditos</h2>
          <div className="space-y-4">
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide">Disponibles</p>
              <p className="text-4xl font-bold text-accent-green">{balance.available ?? 0}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-muted">Del plan</p>
                <p className="font-medium">{balance.planCredits ?? 0}</p>
              </div>
              <div>
                <p className="text-text-muted">Comprados</p>
                <p className="font-medium">{balance.purchasedCredits ?? 0}</p>
              </div>
              <div>
                <p className="text-text-muted">Usados</p>
                <p className="font-medium">{balance.usedCredits ?? 0}</p>
              </div>
              <div>
                <p className="text-text-muted">Renueva</p>
                <p className="font-medium">
                  {balance.resetsAt ? new Date(balance.resetsAt).toLocaleDateString('es-CO') : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Credit Packages */}
      <div className="bg-surface-light border border-border rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Comprar Creditos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg: any) => (
            <div key={pkg.id} className="border border-border rounded-lg p-4 hover:border-accent-green transition-colors">
              <p className="text-2xl font-bold">{pkg.credits}</p>
              <p className="text-text-muted text-sm">creditos</p>
              <p className="text-lg font-semibold mt-2">${pkg.priceUsd}</p>
              <p className="text-xs text-text-muted">${pkg.perCredit.toFixed(2)}/credito</p>
              <button className="mt-3 w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-lighter transition-colors">
                Comprar
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Historial de Transacciones</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Descripcion</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
                <th className="px-6 py-3 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-surface-lighter transition-colors">
                  <td className="px-6 py-3 text-text-muted">
                    {new Date(tx.createdAt).toLocaleDateString('es-CO')}
                  </td>
                  <td className="px-6 py-3">
                    <TypeBadge type={tx.type} />
                  </td>
                  <td className="px-6 py-3 text-text-muted">{tx.description || '—'}</td>
                  <td className={`px-6 py-3 text-right font-medium ${tx.amount > 0 ? 'text-accent-green' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </td>
                  <td className="px-6 py-3 text-right">{tx.balanceAfter}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                    Sin transacciones aun
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plans Comparison */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Planes Disponibles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(PLAN_DETAILS).map(([key, plan]) => (
            <div
              key={key}
              className={`border rounded-xl p-5 ${
                key === currentPlan
                  ? 'border-accent-green bg-accent-green/5'
                  : 'border-border bg-surface-light'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{plan.name}</h3>
                {key === currentPlan && <Badge variant="success">Actual</Badge>}
              </div>
              <p className="text-2xl font-bold mb-3">{plan.price}</p>
              <ul className="space-y-1.5 text-xs text-text-muted">
                {plan.features.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
              {key !== currentPlan && (
                <button className="mt-4 w-full px-3 py-2 border border-border rounded-lg text-sm hover:bg-surface-lighter transition-colors">
                  {key === 'free' ? 'Downgrade' : 'Upgrade'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    deduct: 'bg-red-500/10 text-red-400',
    purchase: 'bg-blue-500/10 text-blue-400',
    plan_reset: 'bg-emerald-500/10 text-emerald-400',
    bonus: 'bg-purple-500/10 text-purple-400',
    refund: 'bg-yellow-500/10 text-yellow-400',
  }
  const labels: Record<string, string> = {
    deduct: 'Uso',
    purchase: 'Compra',
    plan_reset: 'Reset',
    bonus: 'Bonus',
    refund: 'Reembolso',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[type] || 'bg-zinc-500/10 text-zinc-400'}`}>
      {labels[type] || type}
    </span>
  )
}
