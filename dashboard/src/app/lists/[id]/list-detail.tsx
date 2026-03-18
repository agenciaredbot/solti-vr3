'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { updateList, deleteList, removeContactFromList, repopulateList } from '../../contacts/server-actions'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nuevo', CONTACTED: 'Contactado', REPLIED: 'Respondio',
  QUALIFIED: 'Calificado', CUSTOMER: 'Cliente', LOST: 'Descartado',
}

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'primary' | 'danger' | 'default'> = {
  NEW: 'info', CONTACTED: 'warning', REPLIED: 'success',
  QUALIFIED: 'primary', CUSTOMER: 'success', LOST: 'danger',
}

interface Tag { id: string; name: string; color: string }

interface Props {
  initialList: any
  allTags: Tag[]
}

export function ListDetail({ initialList, allTags }: Props) {
  const router = useRouter()
  const [list, setList] = useState(initialList)
  const [members, setMembers] = useState(initialList.members || [])
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(list.name)
  const [editDesc, setEditDesc] = useState(list.description || '')
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [repopulating, setRepopulating] = useState(false)
  const [repopResult, setRepopResult] = useState<any>(null)
  const [search, setSearch] = useState('')

  const filters = list.filters || {}
  const filterTags = (filters.tagIds || []).map((id: string) => allTags.find(t => t.id === id)).filter(Boolean)

  async function handleSave() {
    setSaving(true)
    await updateList(list.id, { name: editName.trim(), description: editDesc.trim() || undefined })
    setList({ ...list, name: editName.trim(), description: editDesc.trim() })
    setEditing(false)
    setSaving(false)
  }

  async function handleDelete() {
    await deleteList(list.id)
    router.push('/lists')
  }

  async function handleRemoveMember(contactId: string) {
    setMembers((prev: any[]) => prev.filter((m: any) => m.contact.id !== contactId))
    await removeContactFromList(list.id, contactId)
  }

  async function handleRepopulate() {
    setRepopulating(true)
    setRepopResult(null)
    const res = await repopulateList(list.id, filters)
    setRepopulating(false)
    if (!res.error) {
      setRepopResult(res.data || res)
      router.refresh()
    }
  }

  const filteredMembers = members.filter((m: any) => {
    if (!search) return true
    const c = m.contact
    const s = search.toLowerCase()
    return (c.firstName || '').toLowerCase().includes(s)
      || (c.lastName || '').toLowerCase().includes(s)
      || (c.email || '').toLowerCase().includes(s)
      || (c.company || '').toLowerCase().includes(s)
      || (c.city || '').toLowerCase().includes(s)
  })

  const scoreColor = (s: number) => s >= 80 ? 'text-accent-green' : s >= 60 ? 'text-accent-yellow' : s >= 30 ? 'text-accent-blue' : 'text-text-muted'

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <Link href="/lists" className="text-xs text-text-muted hover:text-text mb-2 inline-block">← Volver a Listas</Link>
          {editing ? (
            <div className="space-y-2 mt-1">
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre de la lista" />
              <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Descripcion..." rows={2} />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} loading={saving}>Guardar</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditName(list.name); setEditDesc(list.description || '') }}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                {list.name}
                {list.isDynamic && <Badge variant="warning">Inteligente</Badge>}
              </h1>
              {list.description && <p className="text-text-muted mt-1">{list.description}</p>}
            </>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          {!editing && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Editar</Button>
              <Button size="sm" variant="danger" onClick={() => setShowDelete(true)}>Eliminar</Button>
            </>
          )}
        </div>
      </div>

      {/* Smart list filters display */}
      {list.isDynamic && Object.keys(filters).length > 0 && (
        <div className="bg-surface-light border border-border rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Filtros de la lista inteligente</h3>
            <Button size="sm" variant="secondary" onClick={handleRepopulate} loading={repopulating}>
              Repoblar lista
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filterTags.map((tag: any) => (
              <span key={tag.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: tag.color + '20', color: tag.color }}>
                🏷️ {tag.name}
              </span>
            ))}
            {(filters.statuses || []).map((s: string) => (
              <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary">
                {STATUS_LABELS[s] || s}
              </span>
            ))}
            {filters.status && <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/15 text-primary">{STATUS_LABELS[filters.status] || filters.status}</span>}
            {filters.city && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📍 {filters.city}</span>}
            {filters.country && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🌍 {filters.country}</span>}
            {filters.industry && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🏢 {filters.industry}</span>}
            {filters.company && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🏭 {filters.company}</span>}
            {filters.hasEmail && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📧 Email</span>}
            {filters.hasPhone && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📞 Tel</span>}
            {filters.hasWhatsapp && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">💬 WA</span>}
            {filters.hasInstagram && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">📸 IG</span>}
            {filters.hasLinkedin && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">💼 LI</span>}
            {filters.hasWebsite && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🌐 Web</span>}
            {filters.minScore && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">Score ≥{filters.minScore}</span>}
            {filters.maxScore && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">Score ≤{filters.maxScore}</span>}
            {filters.search && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-lighter text-text-muted">🔍 "{filters.search}"</span>}
          </div>
          {repopResult && (
            <p className="text-xs text-accent-green mt-2">
              +{repopResult.added} nuevos contactos agregados ({repopResult.matched} coincidencias, {repopResult.skipped} ya estaban)
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-light border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{members.length}</p>
          <p className="text-xs text-text-muted">Contactos</p>
        </div>
        <div className="bg-surface-light border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{members.filter((m: any) => m.contact.email).length}</p>
          <p className="text-xs text-text-muted">Con email</p>
        </div>
        <div className="bg-surface-light border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{members.filter((m: any) => m.contact.whatsapp || m.contact.phone).length}</p>
          <p className="text-xs text-text-muted">Con telefono/WA</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input placeholder="Buscar en la lista..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Members table */}
      <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-text-muted text-left">
              <th className="px-3 py-3 font-medium">Nombre</th>
              <th className="px-3 py-3 font-medium">Email</th>
              <th className="px-3 py-3 font-medium">Ciudad</th>
              <th className="px-3 py-3 font-medium">Empresa</th>
              <th className="px-3 py-3 font-medium w-16">Score</th>
              <th className="px-3 py-3 font-medium">Estado</th>
              <th className="px-3 py-3 font-medium">Tags</th>
              <th className="px-3 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((m: any) => {
              const c = m.contact
              return (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-surface-lighter/50">
                  <td className="px-3 py-2.5">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-text hover:text-primary transition-colors">
                      {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-text-muted text-xs">{c.email || '—'}</td>
                  <td className="px-3 py-2.5 text-text-muted text-xs">{c.city || '—'}</td>
                  <td className="px-3 py-2.5 text-text-muted text-xs">{c.company || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`font-mono font-bold text-sm ${scoreColor(c.score)}`}>{c.score}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={STATUS_COLORS[c.status] || 'default'}>
                      {STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {(c.contactTags || []).map((ct: any) => (
                        <span
                          key={ct.tag.id}
                          className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ backgroundColor: ct.tag.color + '20', color: ct.tag.color }}
                        >
                          {ct.tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleRemoveMember(c.id)}
                      className="text-text-muted/40 hover:text-red-400 transition-colors text-xs"
                      title="Remover de la lista"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
            {filteredMembers.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                {search ? 'No hay coincidencias' : 'Lista vacia'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Eliminar Lista">
        <div className="space-y-4">
          <p className="text-sm">¿Seguro que quieres eliminar la lista <strong>"{list.name}"</strong>?</p>
          <p className="text-xs text-text-muted">Los contactos NO se eliminaran, solo se quitan de esta lista.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDelete(false)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete}>Eliminar Lista</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
