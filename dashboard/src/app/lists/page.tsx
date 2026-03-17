import { hubFetch } from '@/lib/hub'
import { Badge } from '@/components/ui/badge'
import { ListActions } from './actions'

async function getLists() {
  try {
    return await hubFetch('/lists')
  } catch {
    return { data: [] }
  }
}

export default async function ListsPage() {
  const result = await getLists()
  const lists = result.data || []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Listas de Contactos</h1>
          <p className="text-text-muted mt-1">{lists.length} listas</p>
        </div>
        <ListActions />
      </div>

      {lists.length === 0 ? (
        <div className="bg-surface-light border border-border rounded-xl p-12 text-center">
          <p className="text-5xl mb-4">📋</p>
          <h2 className="text-xl font-semibold mb-2">Sin listas aún</h2>
          <p className="text-text-muted">
            Crea una lista para agrupar contactos y usarla en campañas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lists.map((list: any) => (
            <div key={list.id} className="bg-surface-light border border-border rounded-xl p-6 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-lg">{list.name}</h3>
                <Badge variant="info">{list._count?.members ?? 0} contactos</Badge>
              </div>
              {list.description && (
                <p className="text-text-muted text-sm mb-4">{list.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Creada: {new Date(list.createdAt).toLocaleDateString('es-CO')}</span>
                {list.isDynamic && <Badge variant="warning">Dinámica</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
