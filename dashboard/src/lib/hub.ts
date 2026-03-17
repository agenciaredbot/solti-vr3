/**
 * Hub API client for dashboard.
 * Uses Next.js rewrite proxy to avoid CORS.
 */

const HUB_BASE = process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:4000'
const API_KEY = process.env.SOLTI_API_KEY || ''

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
    throw new Error(`Hub API error ${res.status}: ${text}`)
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
    const text = await res.text()
    throw new Error(`Hub API error ${res.status}: ${text}`)
  }

  return res.json()
}
