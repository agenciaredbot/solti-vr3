'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { hubClientFetch } from '@/lib/hub'

// ═══════════════════════════════════════════════════
// Platform Configuration
// ═══════════════════════════════════════════════════

const PLATFORMS = [
  { id: 'linkedin',        label: 'LinkedIn',        color: '#0A66C2', url: 'https://linkedin.com' },
  { id: 'instagram',       label: 'Instagram',       color: '#E4405F', url: 'https://instagram.com' },
  { id: 'facebook',        label: 'Facebook',        color: '#1877F2', url: 'https://facebook.com' },
  { id: 'twitter',         label: 'X / Twitter',     color: '#1DA1F2', url: 'https://x.com' },
  { id: 'tiktok',          label: 'TikTok',          color: '#FE2C55', url: 'https://tiktok.com' },
  { id: 'threads',         label: 'Threads',         color: '#FFFFFF', url: 'https://threads.net' },
  { id: 'youtube',         label: 'YouTube',         color: '#FF0000', url: 'https://youtube.com' },
  { id: 'googlebusiness',  label: 'Google Business', color: '#4285F4', url: 'https://business.google.com' },
] as const

const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p]))

// Content types available per platform (with emoji hints)
const PLATFORM_CONTENT_TYPES: Record<string, { value: string; label: string; icon: string }[]> = {
  linkedin: [
    { value: 'text',      label: 'Texto',     icon: '📝' },
    { value: 'image',     label: 'Imagen',    icon: '🖼' },
    { value: 'carousel',  label: 'Carrusel',  icon: '📑' },
    { value: 'video',     label: 'Video',     icon: '🎬' },
    { value: 'article',   label: 'Artículo',  icon: '📰' },
  ],
  instagram: [
    { value: 'image',     label: 'Imagen',    icon: '🖼' },
    { value: 'carousel',  label: 'Carrusel',  icon: '📑' },
    { value: 'reel',      label: 'Reel',      icon: '🎞' },
    { value: 'story',     label: 'Historia',  icon: '⏱' },
  ],
  facebook: [
    { value: 'text',      label: 'Texto',     icon: '📝' },
    { value: 'image',     label: 'Imagen',    icon: '🖼' },
    { value: 'video',     label: 'Video',     icon: '🎬' },
    { value: 'link',      label: 'Enlace',    icon: '🔗' },
  ],
  twitter: [
    { value: 'text',      label: 'Tweet',     icon: '📝' },
    { value: 'thread',    label: 'Hilo',      icon: '🧵' },
    { value: 'image',     label: 'Imagen',    icon: '🖼' },
    { value: 'video',     label: 'Video',     icon: '🎬' },
  ],
  tiktok: [
    { value: 'video',     label: 'Video',     icon: '🎬' },
  ],
  threads: [
    { value: 'text',      label: 'Texto',     icon: '📝' },
    { value: 'image',     label: 'Imagen',    icon: '🖼' },
    { value: 'video',     label: 'Video',     icon: '🎬' },
  ],
  youtube: [
    { value: 'video',     label: 'Video',     icon: '🎬' },
    { value: 'short',     label: 'Short',     icon: '⚡' },
  ],
  googlebusiness: [
    { value: 'text',      label: 'Publicación', icon: '📝' },
    { value: 'image',     label: 'Foto',        icon: '🖼' },
    { value: 'event',     label: 'Evento',      icon: '📅' },
    { value: 'offer',     label: 'Oferta',      icon: '🏷' },
  ],
}

// Character limits per platform (some vary by content type)
const CHAR_LIMITS: Record<string, number | Record<string, number>> = {
  linkedin:       { text: 3000, article: 120000, image: 3000, carousel: 3000, video: 3000 },
  twitter:        { text: 280, thread: 280, image: 280, video: 280 },
  instagram:      2200,
  facebook:       63206,
  tiktok:         2200,
  threads:        500,
  youtube:        { video: 5000, short: 100 },
  googlebusiness: 1500,
}

function getCharLimit(platform: string, contentType: string): number {
  const limit = CHAR_LIMITS[platform]
  if (!limit) return 5000
  if (typeof limit === 'number') return limit
  return limit[contentType] || limit[Object.keys(limit)[0]] || 5000
}

// Platform-specific tips
const PLATFORM_TIPS: Record<string, string> = {
  linkedin:       'Usa párrafos cortos y emojis para enganchar. Los carruseles PDF tienen 3x más alcance.',
  instagram:      'Necesitas al menos una imagen o video. Reels tienen 2x más alcance que fotos.',
  facebook:       'Posts con imágenes generan 2.3x más interacción que solo texto.',
  twitter:        '280 caracteres máx. Los hilos funcionan bien para contenido largo.',
  tiktok:         'Solo video. Primeros 3 segundos son clave para retención.',
  threads:        '500 caracteres. Tono conversacional funciona mejor.',
  youtube:        'El título y thumbnail son el 80% del éxito. Shorts < 60 seg.',
  googlebusiness: 'Ideal para actualizaciones locales, ofertas y eventos.',
}

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

interface CalendarProps {
  initialAccounts: any[]
  initialPosts: any[]
}

interface DayData {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  posts: any[]
}

// ═══════════════════════════════════════════════════
// Main Calendar Component
// ═══════════════════════════════════════════════════

export function SocialCalendar({ initialAccounts, initialPosts }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [posts, setPosts] = useState(initialPosts)
  const [accounts] = useState(initialAccounts)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Build calendar grid (Monday-start weeks)
  const calendarDays = useMemo((): DayData[] => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Monday = 0, Sunday = 6
    let startOffset = (firstDay.getDay() + 6) % 7
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7

    const days: DayData[] = []
    for (let i = 0; i < totalCells; i++) {
      const date = new Date(year, month, 1 - startOffset + i)
      const isCurrentMonth = date.getMonth() === month
      const dateKey = dateToKey(date)
      const isToday = dateKey === dateToKey(today)

      const dayPosts = posts.filter(p => {
        const pDate = p.scheduledFor || p.scheduledAt || p.publishedAt || p.createdAt
        if (!pDate) return false
        if (dateToKey(new Date(pDate)) !== dateKey) return false
        if (filterPlatform !== 'all') {
          const platforms = p.platforms || []
          return platforms.some((pl: any) => pl.platform === filterPlatform || pl.platformId === filterPlatform)
        }
        return true
      })

      days.push({ date, isCurrentMonth, isToday, posts: dayPosts })
    }
    return days
  }, [currentDate, posts, filterPlatform, today])

  function prevMonth() {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextMonth() {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  function goToday() {
    setCurrentDate(new Date())
  }

  function handleDayClick(day: DayData) {
    setSelectedDay(day.date)
    setComposerOpen(true)
  }

  function handleComposerClose() {
    setComposerOpen(false)
  }

  function handlePostCreated(newPost: any) {
    setPosts(prev => [newPost, ...prev])
    setComposerOpen(false)
  }

  // Count posts per platform for header stats
  const monthPostCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    calendarDays.forEach(d => {
      if (!d.isCurrentMonth) return
      d.posts.forEach(p => {
        const plats = p.platforms || []
        plats.forEach((pl: any) => {
          const pid = pl.platform || pl.platformId || 'other'
          counts[pid] = (counts[pid] || 0) + 1
        })
      })
    })
    return counts
  }, [calendarDays])

  const totalMonthPosts = Object.values(monthPostCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 overflow-hidden">

      {/* ═══ Top Bar ═══ */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-light/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-4">
          {/* Month Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="w-8 h-8 rounded-lg bg-surface-lighter hover:bg-surface-lighter/80 flex items-center justify-center text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              ‹
            </button>
            <button
              onClick={goToday}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold tracking-wide min-w-[180px] text-center hover:bg-surface-lighter/50 transition-colors cursor-pointer"
            >
              {MONTHS_ES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </button>
            <button
              onClick={nextMonth}
              className="w-8 h-8 rounded-lg bg-surface-lighter hover:bg-surface-lighter/80 flex items-center justify-center text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              ›
            </button>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-border" />

          {/* Platform Filter */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterPlatform('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                filterPlatform === 'all'
                  ? 'bg-white/10 text-text'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              Todas · {totalMonthPosts}
            </button>
            {PLATFORMS.filter(p => accounts.some((a: any) => a.platform === p.id)).map(p => {
              const count = monthPostCounts[p.id] || 0
              return (
                <button
                  key={p.id}
                  onClick={() => setFilterPlatform(filterPlatform === p.id ? 'all' : p.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    filterPlatform === p.id
                      ? 'ring-1 text-text'
                      : 'text-text-muted hover:text-text hover:bg-white/5'
                  }`}
                  style={filterPlatform === p.id ? {
                    backgroundColor: p.color + '20',
                    boxShadow: `inset 0 0 0 1px ${p.color}40`,
                    color: p.color,
                  } : undefined}
                  title={p.label}
                >
                  <PlatformDot platform={p.id} size={8} />
                  {count > 0 && <span>{count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Create Button */}
        <button
          onClick={() => { setSelectedDay(new Date()); setComposerOpen(true) }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer
            bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 hover:shadow-primary/30
            active:scale-[0.97]"
        >
          <span className="text-lg leading-none">+</span>
          Nueva Publicación
        </button>
      </div>

      {/* ═══ Calendar Grid + Composer Panel ═══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* Calendar */}
        <div className={`flex-1 flex flex-col overflow-auto transition-all duration-300 ${composerOpen ? 'mr-0' : ''}`}>

          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-border bg-surface-light/30 shrink-0">
            {DAYS_ES.map(day => (
              <div key={day} className="px-2 py-2.5 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted/60">
                  {day}
                </span>
              </div>
            ))}
          </div>

          {/* Day Cells */}
          <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: '1fr' }}>
            {calendarDays.map((day, idx) => (
              <DayCell
                key={idx}
                day={day}
                isSelected={selectedDay ? dateToKey(selectedDay) === dateToKey(day.date) : false}
                onClick={() => handleDayClick(day)}
              />
            ))}
          </div>
        </div>

        {/* Composer Panel (Slide-in from right) */}
        <div
          className={`shrink-0 border-l border-border bg-surface-light overflow-y-auto transition-all duration-300 ease-out ${
            composerOpen ? 'w-[420px] opacity-100' : 'w-0 opacity-0 border-l-0'
          }`}
        >
          {composerOpen && selectedDay && (
            <ComposerPanel
              date={selectedDay}
              accounts={accounts}
              onClose={handleComposerClose}
              onPostCreated={handlePostCreated}
              existingPosts={calendarDays.find(d => dateToKey(d.date) === dateToKey(selectedDay))?.posts || []}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Day Cell
// ═══════════════════════════════════════════════════

function DayCell({ day, isSelected, onClick }: { day: DayData; isSelected: boolean; onClick: () => void }) {
  const hasPosts = day.posts.length > 0

  // Group posts by platform
  const platformGroups = useMemo(() => {
    const groups: Record<string, any[]> = {}
    day.posts.forEach(p => {
      const plats = p.platforms || []
      const pid = plats[0]?.platform || plats[0]?.platformId || 'other'
      if (!groups[pid]) groups[pid] = []
      groups[pid].push(p)
    })
    return groups
  }, [day.posts])

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col p-1.5 border-b border-r border-border/50 cursor-pointer
        transition-all duration-150 text-left min-h-0 overflow-hidden group
        ${!day.isCurrentMonth ? 'opacity-30' : ''}
        ${isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : 'hover:bg-white/[0.02]'}
        ${day.isToday ? 'bg-white/[0.03]' : ''}
      `}
    >
      {/* Date Number */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={`
            w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium
            ${day.isToday
              ? 'bg-primary text-white font-bold'
              : day.isCurrentMonth
                ? 'text-text group-hover:text-white/90'
                : 'text-text-muted/40'
            }
          `}
        >
          {day.date.getDate()}
        </span>
        {hasPosts && (
          <span className="text-[9px] text-text-muted/50 font-medium tabular-nums">
            {day.posts.length}
          </span>
        )}
      </div>

      {/* Post Pills */}
      <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
        {Object.entries(platformGroups).slice(0, 3).map(([pid, groupPosts]) => {
          const platform = PLATFORM_MAP[pid]
          const color = platform?.color || '#666'
          const content = groupPosts[0]?.content || groupPosts[0]?.text || ''
          const preview = content.slice(0, 28)

          return (
            <div
              key={pid}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight truncate"
              style={{ backgroundColor: color + '18', color: color }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="truncate opacity-80">{preview || platform?.label}</span>
              {groupPosts.length > 1 && (
                <span className="shrink-0 opacity-60">+{groupPosts.length - 1}</span>
              )}
            </div>
          )
        })}
        {Object.keys(platformGroups).length > 3 && (
          <span className="text-[9px] text-text-muted/40 px-1">
            +{Object.keys(platformGroups).length - 3} más
          </span>
        )}
      </div>
    </button>
  )
}

// ═══════════════════════════════════════════════════
// Composer Panel (Slide-in)
// ═══════════════════════════════════════════════════

function ComposerPanel({
  date,
  accounts,
  onClose,
  onPostCreated,
  existingPosts,
}: {
  date: Date
  accounts: any[]
  onClose: () => void
  onPostCreated: (post: any) => void
  existingPosts: any[]
}) {
  const [platform, setPlatform] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [contentType, setContentType] = useState('text')
  const [content, setContent] = useState('')
  const [hour, setHour] = useState('10')
  const [minute, setMinute] = useState('00')
  const [mediaFiles, setMediaFiles] = useState<{ file: File; preview: string }[]>([])
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({})
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'scheduling'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Auto-select first available platform
  useEffect(() => {
    if (!platform && accounts.length > 0) {
      setPlatform(accounts[0].platform)
    }
  }, [accounts, platform])

  // Get accounts for selected platform
  const platformAccounts = useMemo(
    () => accounts.filter((a: any) => a.platform === platform),
    [accounts, platform]
  )

  // Auto-select account when platform changes
  useEffect(() => {
    if (platformAccounts.length === 1) {
      setSelectedAccountId(platformAccounts[0]._id || platformAccounts[0].id || '')
    } else if (platformAccounts.length > 1) {
      // Reset selection so user must choose
      setSelectedAccountId('')
    } else {
      setSelectedAccountId('')
    }
  }, [platform, platformAccounts])

  const accountId = selectedAccountId
  const availableContentTypes = PLATFORM_CONTENT_TYPES[platform] || [{ value: 'text', label: 'Texto', icon: '📝' }]
  const charLimit = getCharLimit(platform, contentType)
  const charCount = content.length
  const charOverLimit = charCount > charLimit
  const platformInfo = PLATFORM_MAP[platform]
  const platformTip = PLATFORM_TIPS[platform]

  // Media config per content type
  const MEDIA_CONTENT_TYPES = new Set(['image', 'carousel', 'video', 'reel', 'short', 'story'])
  const needsMedia = MEDIA_CONTENT_TYPES.has(contentType)
  const isVideoType = ['video', 'reel', 'short'].includes(contentType)
  const maxFiles = contentType === 'carousel' ? 10 : contentType === 'story' ? 10 : 1
  const acceptTypes = isVideoType ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,image/webp,image/gif'

  // Reset content type when platform changes if current type isn't available
  useEffect(() => {
    const available = PLATFORM_CONTENT_TYPES[platform] || []
    if (available.length > 0 && !available.some(ct => ct.value === contentType)) {
      setContentType(available[0].value)
    }
  }, [platform, contentType])

  // Clear media when content type changes
  useEffect(() => {
    setMediaFiles(prev => {
      prev.forEach(m => URL.revokeObjectURL(m.preview))
      return []
    })
  }, [contentType, platform])

  const MAX_IMAGE_SIZE_MB = 50
  const MAX_VIDEO_SIZE_MB = 500
  const MAX_IMAGE_SIZE = MAX_IMAGE_SIZE_MB * 1024 * 1024
  const MAX_VIDEO_SIZE = MAX_VIDEO_SIZE_MB * 1024 * 1024

  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = maxFiles - mediaFiles.length
    const selected = Array.from(files).slice(0, remaining)

    const tooLarge = selected.filter(f => {
      const limit = f.type.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
      return f.size > limit
    })
    if (tooLarge.length > 0) {
      const names = tooLarge.map(f => {
        const limitMB = f.type.startsWith('video/') ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB
        return `${f.name} (${(f.size / 1024 / 1024).toFixed(0)} MB, máx. ${limitMB} MB)`
      }).join(', ')
      setError(`Archivo demasiado grande: ${names}`)
      const valid = selected.filter(f => {
        const limit = f.type.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
        return f.size <= limit
      })
      if (valid.length === 0) return
      const newFiles = valid.map(file => ({ file, preview: URL.createObjectURL(file) }))
      setMediaFiles(prev => [...prev, ...newFiles])
      return
    }

    setError('')
    const newFiles = selected.map(file => ({ file, preview: URL.createObjectURL(file) }))
    setMediaFiles(prev => [...prev, ...newFiles])
  }

  function removeMedia(index: number) {
    setMediaFiles(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function uploadFileWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(`Upload falló: ${xhr.status}`))
      }
      xhr.onerror = () => reject(new Error('Error de red al subir archivo'))
      xhr.ontimeout = () => reject(new Error('Timeout al subir archivo'))
      xhr.timeout = 600000 // 10 min timeout for large files
      xhr.send(file)
    })
  }

  async function uploadMedia(file: File, index: number): Promise<{ url: string; type: string }> {
    // Step 1: Get presigned URL
    setUploadProgress(prev => ({ ...prev, [index]: 0 }))
    const presignRes = await hubClientFetch('/services/execute', {
      method: 'POST',
      body: JSON.stringify({
        service: 'getlate',
        action: 'presign_media',
        params: { filename: file.name, contentType: file.type },
      }),
    })
    const presignData = presignRes.data?.data || presignRes.data
    const uploadUrl = presignData?.url || presignData?.uploadUrl
    const mediaUrl = presignData?.mediaUrl || presignData?.publicUrl || uploadUrl

    if (!uploadUrl) throw new Error('No se pudo obtener URL de subida')

    // Step 2: Upload with progress
    await uploadFileWithProgress(uploadUrl, file, (pct) => {
      setUploadProgress(prev => ({ ...prev, [index]: pct }))
    })

    setUploadProgress(prev => ({ ...prev, [index]: 100 }))

    return {
      url: mediaUrl,
      type: file.type.startsWith('video/') ? 'video' : 'image',
    }
  }

  const formattedDate = date.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  async function handleSchedule() {
    if (!content.trim() || !accountId || !platform) return
    if (needsMedia && mediaFiles.length === 0) {
      setError(`Este tipo de contenido requiere al menos ${isVideoType ? 'un video' : 'una imagen'}`)
      return
    }
    setLoading(true)
    setError('')

    const scheduledAt = new Date(date)
    scheduledAt.setHours(parseInt(hour), parseInt(minute), 0, 0)

    try {
      // Upload media files first (with progress)
      let mediaItems: { url: string; type: string }[] = []
      if (mediaFiles.length > 0) {
        setUploadStatus('uploading')
        setUploadProgress({})
        mediaItems = await Promise.all(mediaFiles.map((m, i) => uploadMedia(m.file, i)))
      }
      setUploadStatus('scheduling')

      const params: Record<string, unknown> = {
        content,
        platforms: [{ accountId, platform }],
        scheduledAt: scheduledAt.toISOString(),
      }
      if (mediaItems.length > 0) {
        params.mediaItems = mediaItems
      }

      const res = await hubClientFetch('/services/execute', {
        method: 'POST',
        body: JSON.stringify({
          service: 'getlate',
          action: 'create_post',
          params,
        }),
      })

      setSuccess(true)
      const newPost = res.data?.data?.post || res.data?.data || {
        content,
        platforms: [{ platform, accountId }],
        scheduledFor: scheduledAt.toISOString(),
        status: 'scheduled',
        _id: `temp-${Date.now()}`,
      }

      setTimeout(() => {
        onPostCreated(newPost)
        router.refresh()
      }, 1200)
    } catch (err: any) {
      setError(err.message || 'Error al programar')
    } finally {
      setLoading(false)
      setUploadStatus('idle')
      setUploadProgress({})
    }
  }

  if (success) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px] animate-in fade-in">
        <div className="w-14 h-14 rounded-full bg-accent-green/15 flex items-center justify-center text-2xl mb-4">
          ✓
        </div>
        <p className="font-semibold text-accent-green">Publicación programada</p>
        <p className="text-text-muted text-xs mt-1">
          {formattedDate} a las {hour}:{minute}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">

      {/* Panel Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <p className="text-sm font-semibold capitalize">{formattedDate}</p>
          <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
            {existingPosts.length} publicacion{existingPosts.length !== 1 ? 'es' : ''} este día
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-surface-lighter hover:bg-surface-lighter/70 flex items-center justify-center text-text-muted hover:text-text transition-colors cursor-pointer text-xs"
        >
          ✕
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Platform Selector — Prominent List */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted/60 mb-3 block">
            ¿Dónde publicar?
          </label>
          <div className="space-y-1.5">
            {PLATFORMS.filter(p => accounts.some((a: any) => a.platform === p.id)).map(p => {
              const isSelected = platform === p.id
              const accs = accounts.filter((a: any) => a.platform === p.id)
              const accountName = accs[0]?.username || accs[0]?.displayName || ''
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all cursor-pointer ${
                    isSelected
                      ? 'shadow-lg'
                      : 'bg-surface-lighter/30 hover:bg-surface-lighter/60 text-text-muted hover:text-text'
                  }`}
                  style={isSelected ? {
                    backgroundColor: p.color + '12',
                    boxShadow: `inset 0 0 0 1.5px ${p.color}50, 0 4px 20px ${p.color}10`,
                  } : undefined}
                >
                  {/* Platform icon */}
                  <PlatformIcon platform={p.id} size={20} color={isSelected ? p.color : '#a3a3a3'} />
                  {/* Label + account */}
                  <div className="flex-1 text-left min-w-0">
                    <span className="font-medium" style={isSelected ? { color: p.color } : undefined}>
                      {p.label}
                    </span>
                    {accs.length === 1 && accountName && (
                      <span className="text-text-muted/50 text-xs ml-2">
                        @{accountName}
                      </span>
                    )}
                  </div>
                  {/* Check indicator */}
                  {isSelected && (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: p.color, color: p.color === '#FFFFFF' ? '#000' : '#fff' }}
                    >
                      ✓
                    </span>
                  )}
                  {accs.length > 1 && (
                    <span className="text-[10px] text-text-muted/40 shrink-0">{accs.length} cuentas</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Account Picker — shown when multiple accounts for selected platform */}
        {platformAccounts.length > 1 && (
          <div className="-mt-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60 mb-2 block">
              Seleccionar cuenta
            </label>
            <div className="space-y-1">
              {platformAccounts.map((acc: any) => {
                const accId = acc._id || acc.id || ''
                const isActive = selectedAccountId === accId
                const pColor = platformInfo?.color || '#a3a3a3'
                return (
                  <button
                    key={accId}
                    onClick={() => setSelectedAccountId(accId)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer ${
                      isActive
                        ? 'bg-surface-lighter'
                        : 'bg-surface-lighter/20 hover:bg-surface-lighter/40 text-text-muted hover:text-text'
                    }`}
                    style={isActive ? {
                      boxShadow: `inset 0 0 0 1.5px ${pColor}40`,
                    } : undefined}
                  >
                    {/* Avatar or initial */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        backgroundColor: isActive ? pColor + '25' : '#262626',
                        color: isActive ? pColor : '#a3a3a3',
                      }}
                    >
                      {(acc.username || acc.displayName || '?')[0].toUpperCase()}
                    </div>
                    {/* Account info */}
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-medium truncate" style={isActive ? { color: pColor } : undefined}>
                        {acc.displayName || acc.username || 'Sin nombre'}
                      </p>
                      {acc.username && acc.displayName && (
                        <p className="text-[10px] text-text-muted/50 truncate">@{acc.username}</p>
                      )}
                    </div>
                    {/* Check */}
                    {isActive && (
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                        style={{ backgroundColor: pColor, color: '#fff' }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {!selectedAccountId && (
              <p className="text-[10px] text-accent-yellow/80 mt-1.5 px-1">
                ⚠ Selecciona una cuenta para continuar
              </p>
            )}
          </div>
        )}

        {/* Platform tip */}
        {platformTip && (
          <p className="text-[11px] text-text-muted/60 leading-relaxed px-1 -mt-2">
            💡 {platformTip}
          </p>
        )}

        {/* Content Type — Dynamic per platform */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60 mb-2 block">
            Tipo de contenido
          </label>
          <div className="flex flex-wrap gap-1.5">
            {availableContentTypes.map(ct => (
              <button
                key={ct.value}
                onClick={() => setContentType(ct.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  contentType === ct.value
                    ? 'text-text'
                    : 'bg-surface-lighter/50 text-text-muted hover:text-text hover:bg-surface-lighter'
                }`}
                style={contentType === ct.value && platformInfo ? {
                  backgroundColor: platformInfo.color + '18',
                  color: platformInfo.color,
                } : undefined}
              >
                <span>{ct.icon}</span>
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
              Contenido
            </label>
            <span className={`text-[10px] font-mono tabular-nums ${charOverLimit ? 'text-red-400' : 'text-text-muted/50'}`}>
              {charCount}/{charLimit}
            </span>
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={`Escribe tu publicación para ${platformInfo?.label || 'la red social'}...`}
            rows={6}
            className={`
              w-full bg-surface border rounded-xl px-4 py-3 text-sm text-text leading-relaxed
              placeholder:text-text-muted/40 focus:outline-none transition-colors resize-none
              ${charOverLimit
                ? 'border-red-500/50 focus:border-red-500'
                : 'border-border focus:border-white/20'
              }
            `}
          />
          {/* Character bar */}
          <div className="mt-1.5 h-0.5 rounded-full bg-surface-lighter overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min((charCount / charLimit) * 100, 100)}%`,
                backgroundColor: charOverLimit ? '#ef4444' : platformInfo?.color || '#666',
              }}
            />
          </div>
        </div>

        {/* Media Upload Zone */}
        {needsMedia && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
                {isVideoType ? 'Video' : contentType === 'carousel' ? 'Imágenes (hasta 10)' : 'Imagen'}
              </label>
              {mediaFiles.length > 0 && (
                <span className="text-[10px] text-text-muted/50">
                  {mediaFiles.length}/{maxFiles}
                </span>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptTypes}
              multiple={maxFiles > 1}
              onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }}
              className="hidden"
            />

            {/* Uploaded previews */}
            {mediaFiles.length > 0 && (
              <div className={`grid gap-2 mb-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {mediaFiles.map((m, i) => {
                  const progress = uploadProgress[i]
                  const isUploading = uploadStatus === 'uploading' && progress !== undefined && progress < 100
                  const isDone = progress === 100
                  return (
                    <div
                      key={i}
                      className="relative group rounded-lg overflow-hidden border border-border bg-surface"
                    >
                      {m.file.type.startsWith('video/') ? (
                        <video
                          src={m.preview}
                          className={`w-full h-28 object-cover ${isUploading ? 'opacity-60' : ''}`}
                          muted
                        />
                      ) : (
                        <img
                          src={m.preview}
                          alt={m.file.name}
                          className={`w-full h-28 object-cover ${isUploading ? 'opacity-60' : ''}`}
                        />
                      )}
                      {/* Upload progress overlay */}
                      {isUploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                          <div className="text-white text-sm font-bold tabular-nums">{progress}%</div>
                          <div className="w-3/4 h-1.5 rounded-full bg-white/20 mt-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-white transition-all duration-200"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-[9px] text-white/60 mt-1">Subiendo...</p>
                        </div>
                      )}
                      {/* Done checkmark */}
                      {isDone && uploadStatus === 'uploading' && (
                        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-accent-green flex items-center justify-center text-white text-[9px]">
                          ✓
                        </div>
                      )}
                      {/* File info overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                        <p className="text-[9px] text-white/80 truncate">{m.file.name}</p>
                        <p className="text-[8px] text-white/50">
                          {m.file.size >= 1024 * 1024 * 1024
                            ? `${(m.file.size / 1024 / 1024 / 1024).toFixed(2)} GB`
                            : `${(m.file.size / 1024 / 1024).toFixed(1)} MB`
                          }
                        </p>
                      </div>
                      {/* Remove button — hidden during upload */}
                      {!loading && (
                        <button
                          onClick={() => removeMedia(i)}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 hover:bg-red-500/80 flex items-center justify-center text-white text-[9px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Drop zone / Add button */}
            {mediaFiles.length < maxFiles && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-white/30') }}
                onDragLeave={e => { e.currentTarget.classList.remove('border-white/30') }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.classList.remove('border-white/30')
                  handleFileSelect(e.dataTransfer.files)
                }}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-border hover:border-white/20 bg-surface/50 hover:bg-surface-lighter/30 transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-surface-lighter flex items-center justify-center text-text-muted">
                  {isVideoType ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-muted">
                    {isVideoType ? 'Arrastra un video o' : 'Arrastra una imagen o'}{' '}
                    <span className="text-text underline underline-offset-2">busca en tu equipo</span>
                  </p>
                  <p className="text-[10px] text-text-muted/40 mt-0.5">
                    {isVideoType ? 'MP4, MOV, WebM — máx. 500 MB' : 'JPG, PNG, WebP, GIF — máx. 50 MB'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Time Picker */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60 mb-2 block">
            Hora de publicación
          </label>
          <div className="flex items-center gap-2">
            <select
              value={hour}
              onChange={e => setHour(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-white/20 transition-colors w-20 cursor-pointer appearance-none text-center font-mono"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={String(i).padStart(2, '0')}>
                  {String(i).padStart(2, '0')}
                </option>
              ))}
            </select>
            <span className="text-text-muted font-bold">:</span>
            <select
              value={minute}
              onChange={e => setMinute(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-white/20 transition-colors w-20 cursor-pointer appearance-none text-center font-mono"
            >
              {['00', '15', '30', '45'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <span className="text-text-muted/40 text-xs ml-1">COT</span>
          </div>
        </div>

        {/* Preview Section */}
        {content.trim() && platformInfo && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60 mb-2 block">
              Vista previa
            </label>
            <div
              className="rounded-xl border p-4 space-y-2"
              style={{ borderColor: platformInfo.color + '30', backgroundColor: platformInfo.color + '05' }}
            >
              <div className="flex items-center gap-2">
                <PlatformDot platform={platform} size={12} />
                <span className="text-xs font-medium" style={{ color: platformInfo.color }}>
                  {platformInfo.label}
                </span>
                {selectedAccountId && platformAccounts.length > 1 && (() => {
                  const selAcc = platformAccounts.find((a: any) => (a._id || a.id) === selectedAccountId)
                  return selAcc ? (
                    <span className="text-[10px] text-text-muted/50">
                      @{selAcc.username || selAcc.displayName}
                    </span>
                  ) : null
                })()}
                <span className="text-[10px] text-text-muted/40 ml-auto">
                  {hour}:{minute}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-text/80 whitespace-pre-wrap">
                {content.length > 200 ? content.slice(0, 200) + '…' : content}
              </p>
              {/* Media preview thumbnails */}
              {mediaFiles.length > 0 && (
                <div className={`flex gap-1.5 mt-1 ${mediaFiles.length > 3 ? 'flex-wrap' : ''}`}>
                  {mediaFiles.map((m, i) => (
                    <div key={i} className="w-12 h-12 rounded-md overflow-hidden border border-white/10 shrink-0">
                      {m.file.type.startsWith('video/') ? (
                        <video src={m.preview} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={m.preview} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {contentType !== 'text' && mediaFiles.length === 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted/50">
                  <span>{contentType === 'image' ? '🖼' : contentType === 'video' || contentType === 'reel' ? '🎬' : '📑'}</span>
                  <span>{availableContentTypes.find(c => c.value === contentType)?.label}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Existing Posts for this day */}
        {existingPosts.length > 0 && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60 mb-2 block">
              Ya programado este día
            </label>
            <div className="space-y-1.5">
              {existingPosts.map((p: any, i: number) => {
                const plats = p.platforms || []
                const pid = plats[0]?.platform || plats[0]?.platformId || 'other'
                const pInfo = PLATFORM_MAP[pid]
                const pContent = p.content || p.text || ''
                const pTime = p.scheduledFor || p.scheduledAt
                return (
                  <div
                    key={p._id || p.id || i}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-lighter/50 text-xs"
                  >
                    <PlatformDot platform={pid} size={8} />
                    <span className="truncate flex-1 text-text-muted">{pContent.slice(0, 40) || '—'}</span>
                    {pTime && (
                      <span className="text-text-muted/40 shrink-0 font-mono text-[10px]">
                        {new Date(pTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Panel Footer — Action Button */}
      <div className="p-5 border-t border-border shrink-0">
        <button
          onClick={handleSchedule}
          disabled={loading || !content.trim() || !accountId || charOverLimit || (needsMedia && mediaFiles.length === 0)}
          className={`
            w-full py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer
            disabled:opacity-40 disabled:cursor-not-allowed
            ${loading
              ? 'bg-surface-lighter text-text-muted'
              : 'bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98]'
            }
          `}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⟳</span>
              {uploadStatus === 'uploading'
                ? `Subiendo archivos... ${Object.values(uploadProgress).length > 0
                    ? Math.round(Object.values(uploadProgress).reduce((a, b) => a + b, 0) / Object.values(uploadProgress).length)
                    : 0}%`
                : 'Programando...'}
            </span>
          ) : (
            `Programar para ${String(hour).padStart(2, '0')}:${minute}`
          )}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Platform Dot (colored circle with initials)
// ═══════════════════════════════════════════════════

function PlatformDot({ platform, size = 10 }: { platform: string; size?: number }) {
  const info = PLATFORM_MAP[platform]
  if (!info) return <span className="rounded-full bg-surface-lighter" style={{ width: size, height: size }} />

  return (
    <span
      className="rounded-full shrink-0 inline-block"
      style={{ width: size, height: size, backgroundColor: info.color }}
      title={info.label}
    />
  )
}

// SVG icons for each platform (simplified brand marks)
function PlatformIcon({ platform, size = 20, color }: { platform: string; size?: number; color?: string }) {
  const info = PLATFORM_MAP[platform]
  const fill = color || info?.color || '#666'

  const icons: Record<string, React.ReactNode> = {
    linkedin: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
    instagram: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
    facebook: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    twitter: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
    tiktok: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
      </svg>
    ),
    threads: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.781 3.632 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.19.408-2.285 1.33-3.082.88-.763 2.108-1.21 3.553-1.293 1.07-.061 2.073.048 2.99.326l.023-.009c-.04-.848-.22-1.494-.538-1.927-.378-.515-1.004-.793-1.856-.826-1.178-.046-2.063.322-2.406.854l-1.769-1.069c.727-1.126 2.208-1.81 3.963-1.731 1.39.054 2.476.544 3.228 1.456.648.786 1.009 1.823 1.074 3.084.598.282 1.13.636 1.576 1.065 1.032.992 1.667 2.383 1.836 4.02.175 1.703-.186 3.484-1.478 4.748C18.726 23.098 16.184 23.98 12.186 24zm-1.248-8.667c-.994.057-1.738.341-2.15.822-.328.383-.487.88-.46 1.434.035.675.337 1.158.896 1.52.636.413 1.444.58 2.272.537 1.078-.059 1.887-.455 2.406-1.178.327-.456.57-1.044.727-1.763-.65-.216-1.346-.344-2.08-.368-.543-.019-1.08-.019-1.611-.004z"/>
      </svg>
    ),
    youtube: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
    googlebusiness: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d="M12 11.807A9.002 9.002 0 0 1 10.049 2a9.942 9.942 0 0 1 1.951-.194c5.514 0 9.987 4.461 10 9.978a4.527 4.527 0 0 1-4.527 4.527h-1.7a1.627 1.627 0 0 0-1.164.49 1.51 1.51 0 0 0-.45 1.084c0 .397.158.777.44 1.058.044.045.127.14.127.252 0 .09-.072.18-.2.251A4.948 4.948 0 0 1 12 20.07 8.26 8.26 0 0 1 3.739 12 8.26 8.26 0 0 1 12 3.739 8.26 8.26 0 0 1 20.261 12h.003zm0 0a1.862 1.862 0 1 0 0-3.724 1.862 1.862 0 0 0 0 3.724zM5.285 10.07a1.862 1.862 0 1 0 0-3.725 1.862 1.862 0 0 0 0 3.725zm0 6.322a1.862 1.862 0 1 0 0-3.724 1.862 1.862 0 0 0 0 3.724zM9.066 18.07a1.862 1.862 0 1 0 0-3.725 1.862 1.862 0 0 0 0 3.725z"/>
      </svg>
    ),
  }

  return (
    <span className="shrink-0 inline-flex items-center justify-center" title={info?.label}>
      {icons[platform] || <PlatformDot platform={platform} size={size} />}
    </span>
  )
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
