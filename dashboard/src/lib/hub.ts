/**
 * Hub API client for dashboard.
 * Uses Next.js rewrite proxy to avoid CORS.
 */

const HUB_BASE = process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:4000'
const API_KEY = process.env.SOLTI_API_KEY || ''

/** Sanitize error messages — never expose internal details to the client */
function sanitizeErrorMessage(status: number): string {
  switch (status) {
    case 400: return 'Solicitud inválida. Revisa los datos e intenta de nuevo.'
    case 401: return 'No autorizado. Inicia sesión de nuevo.'
    case 403: return 'No tienes permisos para esta acción.'
    case 404: return 'Recurso no encontrado.'
    case 429: return 'Demasiadas solicitudes. Espera un momento.'
    default: return `Error del servidor (${status}). Intenta de nuevo.`
  }
}

// Server-side direct calls
export async function hubFetch(path: string, options?: RequestInit): Promise<any> {
  const url = `${HUB_BASE}/api/v1${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'X-Api-Key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options?.headers,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    // Log full error server-side, throw sanitized message
    console.error(`Hub API error ${res.status}: ${text}`)
    throw new Error(sanitizeErrorMessage(res.status))
  }

  return res.json()
}

// Client-side calls (through rewrite proxy)
export async function hubClientFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`/api/hub${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(sanitizeErrorMessage(res.status))
  }

  return res.json()
}
