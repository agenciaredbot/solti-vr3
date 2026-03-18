'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_SECTIONS = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '📊' },
      { href: '/contacts', label: 'Contactos', icon: '👥' },
      { href: '/scraping', label: 'Prospeccion', icon: '🔍' },
      { href: '/campaigns', label: 'Campañas', icon: '📧' },
      { href: '/whatsapp', label: 'WhatsApp', icon: '💬' },
      { href: '/campaigns/whatsapp', label: 'Campanas WA', icon: '📣' },
      { href: '/social', label: 'Redes Sociales', icon: '📱' },
      { href: '/lists', label: 'Listas', icon: '📋' },
    ],
  },
  {
    title: 'Inteligencia',
    items: [
      { href: '/analytics', label: 'Analytics', icon: '📈' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/billing', label: 'Facturacion', icon: '💳' },
      { href: '/settings', label: 'Configuracion', icon: '⚙️' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [hubStatus, setHubStatus] = useState<'online' | 'offline' | 'checking'>('checking')

  useEffect(() => {
    async function checkHub() {
      try {
        const res = await fetch('/api/hub-health')
        setHubStatus(res.ok ? 'online' : 'offline')
      } catch {
        setHubStatus('offline')
      }
    }
    checkHub()
    const interval = setInterval(checkHub, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <aside className="w-64 bg-surface-light border-r border-border min-h-screen flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-bold">
          <span className="text-primary">Solti</span>
          <span className="text-text-muted text-sm ml-2">v3</span>
        </h1>
        <p className="text-text-muted text-xs mt-1">Growth Engine Dashboard</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {NAV_SECTIONS.map(section => (
          <div key={section.title}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/50 mb-2 px-4">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`
                      flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${active
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-text-muted hover:text-text hover:bg-surface-lighter'
                      }
                    `}
                  >
                    <span className="text-base">{icon}</span>
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-2">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Hub:</span>
          {hubStatus === 'checking' && <span className="text-accent-yellow">● Verificando...</span>}
          {hubStatus === 'online' && <span className="text-accent-green">● Conectado</span>}
          {hubStatus === 'offline' && <span className="text-red-400">● Desconectado</span>}
        </div>
        <p className="text-[10px] text-text-muted/40">Solti Growth Engine © 2026</p>
      </div>
    </aside>
  )
}
