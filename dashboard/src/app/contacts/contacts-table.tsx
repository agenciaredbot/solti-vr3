'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { fetchContacts, updateContactStatus } from './server-actions'
import { CreateListModal } from './create-list-modal'
import { AddTagModal } from './add-tag-modal'
import { KanbanBoard } from './kanban-board'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'NEW', label: 'Nuevo' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'REPLIED', label: 'Respondio' },
  { value: 'QUALIFIED', label: 'Calificado' },
  { value: 'CUSTOMER', label: 'Cliente' },
  { value: 'LOST', label: 'Descartado' },
]

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'primary' | 'danger' | 'default'> = {
  NEW: 'info',
  CONTACTED: 'warning',
  REPLIED: 'success',
  QUALIFIED: 'primary',
  CUSTOMER: 'success',
  LOST: 'danger',
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  REPLIED: 'Respondio',
  QUALIFIED: 'Calificado',
  CUSTOMER: 'Cliente',
  LOST: 'Descartado',
}

interface Tag { id: string; name: string; color: string; _count?: { contactTags: number } }
interface Contact {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  score: number
  status: string
  source: string | null
  contactTags?: { tag: Tag }[]
}

interface Props {
  initialContacts: Contact[]
  initialTotal: number
  tags: Tag[]
}

export function ContactsTable({ initialContacts, initialTotal, tags }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'table' | 'kanban'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('contacts-view') as 'table' | 'kanban') || 'table'
    return 'table'
  })

  // Data
  const [contacts, setContacts] = useState(initialContacts)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [page, setPage] = useState(1)
  const limit = view === 'kanban' ? 200 : 25

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [listModalOpen, setListModalOpen] = useState(false)
  const [tagModalOpen, setTagModalOpen] = useState(false)

  const loadContacts = useCallback(async () => {
    setLoading(true)
    const res = await fetchContacts({
      page,
      limit,
      status: statusFilter || undefined,
      tag: tagFilter || undefined,
      city: cityFilter || undefined,
      search: search || undefined,
      sortBy: 'score',
      sortDir: 'desc',
    })
    setContacts(res.data || [])
    setTotal(res.pagination?.total || 0)
    setLoading(false)
  }, [page, limit, statusFilter, tagFilter, cityFilter, search])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(loadContacts, 300)
    return () => clearTimeout(timer)
  }, [loadContacts])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [statusFilter, tagFilter, cityFilter, search])

  function toggleView(v: 'table' | 'kanban') {
    setView(v)
    localStorage.setItem('contacts-view', v)
    setSelectedIds(new Set())
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function toggleAll() {
    if (selectedIds.size === contacts.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(contacts.map(c => c.id)))
  }

  async function handleKanbanDrop(contactId: string, newStatus: string) {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status: newStatus } : c))
    const res = await updateContactStatus(contactId, newStatus)
    if (res.error) {
      loadContacts()
    }
  }

  function handleBulkSuccess() {
    setSelectedIds(new Set())
    loadContacts()
  }

  const totalPages = Math.ceil(total / limit)
  const scoreColor = (s: number) => s >= 80 ? 'text-accent-green' : s >= 60 ? 'text-accent-yellow' : s >= 30 ? 'text-accent-blue' : 'text-text-muted'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Contactos</h1>
          <p className="text-text-muted mt-1">{total} contactos en total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface rounded-lg p-0.5 border border-border">
            <button
              onClick={() => toggleView('table')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === 'table' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              Tabla
            </button>
            <button
              onClick={() => toggleView('kanban')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === 'kanban' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              Kanban
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Buscar nombre, email, telefono..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
        {tags.length > 0 && (
          <div className="w-40">
            <Select
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
              options={[{ value: '', label: 'Todos los tags' }, ...tags.map(t => ({ value: t.id, label: t.name }))]}
            />
          </div>
        )}
        <div className="w-36">
          <Input
            placeholder="Ciudad..."
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
          />
        </div>
      </div>

      {loading && <div className="h-1 bg-primary/20 rounded-full mb-2"><div className="h-1 bg-primary rounded-full animate-pulse w-1/3" /></div>}

      {/* Table View */}
      {view === 'table' && (
        <>
          <div className="bg-surface-light border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-text-muted text-left">
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" checked={selectedIds.size === contacts.length && contacts.length > 0} onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="px-3 py-3 font-medium">Nombre</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Ciudad</th>
                  <th className="px-3 py-3 font-medium w-16">Score</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-surface-lighter/50">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/contacts/${c.id}`} className="font-medium text-text hover:text-primary transition-colors">
                        {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{c.email || '—'}</td>
                    <td className="px-3 py-2.5 text-text-muted">{c.city || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`font-mono font-bold ${scoreColor(c.score)}`}>{c.score}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={STATUS_COLORS[c.status] || 'default'}>
                        {STATUS_LABELS[c.status] || c.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {c.contactTags?.map(ct => (
                          <span
                            key={ct.tag.id}
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ backgroundColor: ct.tag.color + '20', color: ct.tag.color }}
                          >
                            {ct.tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">No se encontraron contactos</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-text-muted">Pagina {page} de {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Kanban View */}
      {view === 'kanban' && (
        <KanbanBoard contacts={contacts} onStatusChange={handleKanbanDrop} />
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && view === 'table' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-light border border-border rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedIds.size} seleccionados</span>
          <Button size="sm" onClick={() => setListModalOpen(true)}>Crear Lista</Button>
          <Button size="sm" variant="secondary" onClick={() => setTagModalOpen(true)}>Agregar Tag</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpiar</Button>
        </div>
      )}

      <CreateListModal
        open={listModalOpen}
        onClose={() => setListModalOpen(false)}
        selectedIds={Array.from(selectedIds)}
        onSuccess={handleBulkSuccess}
      />

      <AddTagModal
        open={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        selectedContactIds={Array.from(selectedIds)}
        existingTags={tags}
        onSuccess={handleBulkSuccess}
      />
    </div>
  )
}
