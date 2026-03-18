'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { updateInstanceConfig } from '../server-actions'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  CONNECTED: 'success', CONNECTING: 'warning', DISCONNECTED: 'danger',
}

interface Props {
  initialInstance: any
}

export function InstanceConfig({ initialInstance }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [instance, setInstance] = useState(initialInstance)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'agent' | 'settings'>('agent')

  // Agent config
  const [systemPrompt, setSystemPrompt] = useState(instance.systemPrompt || '')
  const [additionalContext, setAdditionalContext] = useState(instance.additionalContext || '')
  const [autoReply, setAutoReply] = useState(instance.autoReply || false)
  const [fallbackMsg, setFallbackMsg] = useState(instance.fallbackMsg || '')

  // Advanced settings
  const [maxTokens, setMaxTokens] = useState(String(instance.maxTokens || 500))
  const [maxHistoryMsgs, setMaxHistoryMsgs] = useState(String(instance.maxHistoryMsgs || 10))
  const [cooldownSecs, setCooldownSecs] = useState(String(instance.cooldownSecs || 60))

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const data: Record<string, any> = {
      systemPrompt: systemPrompt || null,
      additionalContext: additionalContext || null,
      autoReply,
      fallbackMsg: fallbackMsg || null,
      maxTokens: Number(maxTokens) || 500,
      maxHistoryMsgs: Number(maxHistoryMsgs) || 10,
      cooldownSecs: Number(cooldownSecs) || 60,
    }
    const res = await updateInstanceConfig(instance.id, data)
    setSaving(false)
    if (!res.error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      setSystemPrompt(content)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/whatsapp" className="text-xs text-text-muted hover:text-text mb-2 inline-block">← Volver a WhatsApp</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{instance.instanceName}</h1>
          <Badge variant={STATUS_VARIANT[instance.status] || 'default'}>{instance.status}</Badge>
        </div>
        {instance.phoneNumber && (
          <p className="text-text-muted mt-1">+{instance.phoneNumber}</p>
        )}
      </div>

      {/* Auto-reply toggle — prominent */}
      <div className="bg-surface-light border border-border rounded-xl p-5 mb-6 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Agente de Auto-Respuesta</h3>
          <p className="text-sm text-text-muted mt-0.5">
            {autoReply
              ? 'El agente responde automaticamente a mensajes entrantes'
              : 'Las respuestas automaticas estan desactivadas'}
          </p>
        </div>
        <button
          onClick={() => setAutoReply(!autoReply)}
          className={`relative w-12 h-7 rounded-full transition-colors ${autoReply ? 'bg-accent-green' : 'bg-surface-lighter'}`}
        >
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow ${autoReply ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {(['agent', 'settings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {{ agent: 'Contexto del Agente', settings: 'Configuracion Avanzada' }[t]}
          </button>
        ))}
      </div>

      {tab === 'agent' && (
        <div className="space-y-6">
          {/* System Prompt — Main context */}
          <div className="bg-surface-light border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold">Contexto Principal del Agente</h3>
                <p className="text-xs text-text-muted mt-1">
                  Instrucciones y conocimiento base del agente. Puedes subir un archivo .md o escribir directamente.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".md,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                  Subir archivo .md
                </Button>
              </div>
            </div>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder={`Ejemplo:

# Agente de Ventas — Redbot

Eres un agente de ventas de Redbot, una agencia de inteligencia artificial para negocios.

## Servicios que ofrecemos:
- Automatizacion de WhatsApp
- Generacion de leads con IA
- CRM inteligente
- Campanas de email

## Precios:
- Plan Pro: $29/mes
- Plan Growth: $79/mes
- Plan Agency: $499/mes

## Reglas:
- Siempre saluda amablemente
- Responde en el idioma del cliente
- Si no sabes algo, ofrece conectar con un humano
- Nunca inventes precios o funcionalidades`}
              rows={16}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text font-mono focus:border-primary/50 focus:outline-none resize-y"
            />
            <p className="text-[10px] text-text-muted/50 mt-1">{systemPrompt.length} caracteres</p>
          </div>

          {/* Additional Context */}
          <div className="bg-surface-light border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-1">Informacion Adicional</h3>
            <p className="text-xs text-text-muted mb-3">
              Links, numeros, horarios, promociones, cualquier dato extra que el agente deba conocer. Se agrega al final del contexto principal.
            </p>
            <textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              placeholder={`Ejemplo:

📞 Linea directa: +57 301 947 2361
🌐 Web: https://theredbot.com
📍 Oficina: Armenia, Quindio, Colombia

💰 Promocion activa: 20% descuento primer mes con codigo SOLTI20
⏰ Horario atencion: Lun-Vie 8am-6pm, Sab 9am-1pm

🔗 Links utiles:
- Agendar demo: https://calendly.com/redbot
- Portafolio: https://theredbot.com/portafolio
- WhatsApp ventas: https://wa.me/573019472361

📋 Preguntas frecuentes:
- Tiempo de implementacion: 1-2 semanas
- Soporte incluido: Si, 24/7 via WhatsApp
- Prueba gratis: Si, 7 dias`}
              rows={12}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text focus:border-primary/50 focus:outline-none resize-y"
            />
            <p className="text-[10px] text-text-muted/50 mt-1">{additionalContext.length} caracteres</p>
          </div>

          {/* Fallback Message */}
          <div className="bg-surface-light border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-1">Mensaje de Respaldo</h3>
            <p className="text-xs text-text-muted mb-3">
              Se envia si el agente IA no puede generar una respuesta (error de API, etc.)
            </p>
            <Textarea
              value={fallbackMsg}
              onChange={e => setFallbackMsg(e.target.value)}
              placeholder="Hola! Gracias por tu mensaje. En este momento no puedo responderte automaticamente, pero un miembro de nuestro equipo te contactara pronto."
              rows={3}
            />
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-surface-light border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Parametros del Agente</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Input
                  label="Max tokens por respuesta"
                  type="number"
                  value={maxTokens}
                  onChange={e => setMaxTokens(e.target.value)}
                />
                <p className="text-[10px] text-text-muted mt-1">Largo maximo de respuesta (100-2000)</p>
              </div>
              <div>
                <Input
                  label="Historial de mensajes"
                  type="number"
                  value={maxHistoryMsgs}
                  onChange={e => setMaxHistoryMsgs(e.target.value)}
                />
                <p className="text-[10px] text-text-muted mt-1">Mensajes previos que el agente ve (1-50)</p>
              </div>
              <div>
                <Input
                  label="Cooldown (segundos)"
                  type="number"
                  value={cooldownSecs}
                  onChange={e => setCooldownSecs(e.target.value)}
                />
                <p className="text-[10px] text-text-muted mt-1">Espera entre auto-respuestas al mismo contacto</p>
              </div>
            </div>
          </div>

          <div className="bg-surface-light border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-2">Que significan estos parametros</h3>
            <div className="space-y-2 text-sm text-text-muted">
              <p><strong className="text-text">Max tokens:</strong> Controla el largo de cada respuesta. 500 = ~2 parrafos. 1000 = respuestas mas detalladas.</p>
              <p><strong className="text-text">Historial:</strong> Cuantos mensajes previos de la conversacion ve el agente. Mas = mejor contexto pero mas costo.</p>
              <p><strong className="text-text">Cooldown:</strong> Evita que el agente responda multiples veces seguidas al mismo contacto. 60s = espera 1 minuto entre respuestas.</p>
            </div>
          </div>
        </div>
      )}

      {/* Save bar */}
      <div className="sticky bottom-0 bg-surface border-t border-border py-4 mt-6 flex items-center justify-between">
        <div>
          {saved && <span className="text-accent-green text-sm font-medium">✓ Guardado correctamente</span>}
        </div>
        <Button onClick={handleSave} loading={saving}>
          Guardar Configuracion
        </Button>
      </div>
    </div>
  )
}
