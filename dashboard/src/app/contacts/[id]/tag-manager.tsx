'use client'

import { useState } from 'react'
import { addTagToContact, removeTagFromContact } from '../server-actions'

const PRESET_COLORS = [
  '#6366f1', '#ef4444', '#f59e0b', '#22c55e',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
]

interface Tag { id: string; name: string; color: string }

interface Props {
  contactId: string
  currentTags: Tag[]
  allTags: Tag[]
}

export function TagManager({ contactId, currentTags, allTags }: Props) {
  const [tags, setTags] = useState(currentTags)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])

  const availableTags = allTags.filter(t => !tags.some(ct => ct.id === t.id))

  async function handleRemove(tagId: string) {
    setTags(prev => prev.filter(t => t.id !== tagId))
    const res = await removeTagFromContact(contactId, tagId)
    if (res.error) setTags(currentTags)
  }

  async function handleAdd(tag: Tag) {
    setTags(prev => [...prev, tag])
    setShowAdd(false)
    const res = await addTagToContact(contactId, tag.name, tag.color)
    if (res.error) setTags(tags)
  }

  async function handleCreateNew() {
    if (!newName.trim()) return
    const optimisticTag = { id: 'temp-' + Date.now(), name: newName.trim(), color: newColor }
    setTags(prev => [...prev, optimisticTag])
    setNewName('')
    setShowAdd(false)
    const res = await addTagToContact(contactId, newName.trim(), newColor)
    if (res.error) {
      setTags(prev => prev.filter(t => t.id !== optimisticTag.id))
    } else if (res.data) {
      setTags(prev => prev.map(t => t.id === optimisticTag.id ? { id: res.data.tagId || res.data.id || t.id, name: t.name, color: t.color } : t))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: tag.color + '20', color: tag.color }}
          >
            {tag.name}
            <button onClick={() => handleRemove(tag.id)} className="hover:opacity-60 ml-0.5">×</button>
          </span>
        ))}
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-2 py-1 rounded-full text-xs border border-dashed border-border text-text-muted hover:text-text hover:border-text-muted transition-colors"
        >
          +
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface border border-border rounded-lg p-3 space-y-3 mt-2">
          {availableTags.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted mb-1.5">Tags existentes:</p>
              <div className="flex flex-wrap gap-1">
                {availableTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleAdd(tag)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: tag.color + '20', color: tag.color }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] text-text-muted mb-1.5">Nuevo tag:</p>
            <div className="flex gap-2 items-end">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nombre..."
                className="flex-1 px-2 py-1.5 bg-surface-light border border-border rounded text-xs text-text focus:border-primary/50 focus:outline-none"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateNew() }}
              />
              <div className="flex gap-1">
                {PRESET_COLORS.slice(0, 4).map(color => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-5 h-5 rounded-full ${newColor === color ? 'ring-1 ring-white ring-offset-1 ring-offset-surface' : ''}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button
                onClick={handleCreateNew}
                disabled={!newName.trim()}
                className="px-2 py-1.5 bg-primary text-white text-xs rounded hover:bg-primary/80 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
