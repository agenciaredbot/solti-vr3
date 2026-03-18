'use client'

import { useState } from 'react'
import Link from 'next/link'

const STATUSES = [
  { key: 'NEW', label: 'Nuevo', color: '#3b82f6' },
  { key: 'CONTACTED', label: 'Contactado', color: '#f59e0b' },
  { key: 'REPLIED', label: 'Respondio', color: '#22c55e' },
  { key: 'QUALIFIED', label: 'Calificado', color: '#ef4444' },
  { key: 'CUSTOMER', label: 'Cliente', color: '#10b981' },
  { key: 'LOST', label: 'Descartado', color: '#6b7280' },
]

interface Contact {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  score: number
  status: string
  city: string | null
  contactTags?: { tag: { id: string; name: string; color: string } }[]
}

interface Props {
  contacts: Contact[]
  onStatusChange: (contactId: string, newStatus: string) => void
}

export function KanbanBoard({ contacts, onStatusChange }: Props) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function handleDragStart(e: React.DragEvent, contactId: string) {
    e.dataTransfer.setData('contactId', contactId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(contactId)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverColumn(null)
  }

  function handleDragOver(e: React.DragEvent, status: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(status)
  }

  function handleDragLeave() {
    setDragOverColumn(null)
  }

  function handleDrop(e: React.DragEvent, newStatus: string) {
    e.preventDefault()
    const contactId = e.dataTransfer.getData('contactId')
    if (contactId) {
      const contact = contacts.find(c => c.id === contactId)
      if (contact && contact.status !== newStatus) {
        onStatusChange(contactId, newStatus)
      }
    }
    setDragOverColumn(null)
    setDraggingId(null)
  }

  const scoreColor = (s: number) => s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : s >= 30 ? '#3b82f6' : '#6b7280'

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
      {STATUSES.map(status => {
        const columnContacts = contacts.filter(c => c.status === status.key)
        const isOver = dragOverColumn === status.key

        return (
          <div
            key={status.key}
            className={`flex-shrink-0 w-64 bg-surface rounded-xl border transition-all ${
              isOver ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragOver={e => handleDragOver(e, status.key)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, status.key)}
          >
            {/* Column header */}
            <div className="px-3 py-2.5 border-b border-border/50" style={{ borderTopColor: status.color, borderTopWidth: 3, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{status.label}</span>
                <span className="text-xs text-text-muted bg-surface-light px-2 py-0.5 rounded-full">{columnContacts.length}</span>
              </div>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 max-h-[calc(60vh-50px)] overflow-y-auto">
              {columnContacts.map(contact => (
                <div
                  key={contact.id}
                  draggable
                  onDragStart={e => handleDragStart(e, contact.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-surface-light border border-border/50 rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all hover:border-border ${
                    draggingId === contact.id ? 'opacity-40 scale-95' : ''
                  }`}
                >
                  <Link href={`/contacts/${contact.id}`} className="block" onClick={e => { if (draggingId) e.preventDefault() }}>
                    <p className="font-medium text-sm truncate">
                      {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'}
                    </p>
                    {contact.email && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{contact.email}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex gap-1 flex-wrap">
                        {contact.contactTags?.slice(0, 3).map(ct => (
                          <span
                            key={ct.tag.id}
                            className="w-2 h-2 rounded-full inline-block"
                            title={ct.tag.name}
                            style={{ backgroundColor: ct.tag.color }}
                          />
                        ))}
                      </div>
                      <span
                        className="text-xs font-mono font-bold"
                        style={{ color: scoreColor(contact.score) }}
                      >
                        {contact.score}
                      </span>
                    </div>
                    {contact.city && (
                      <p className="text-[10px] text-text-muted/60 mt-1 truncate">{contact.city}</p>
                    )}
                  </Link>
                </div>
              ))}
              {columnContacts.length === 0 && (
                <div className="text-center py-6 text-text-muted/40 text-xs">
                  Arrastra contactos aqui
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
