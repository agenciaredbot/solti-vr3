'use server'

import { hubFetch } from '@/lib/hub'

export async function getInstance(id: string) {
  try {
    return await hubFetch(`/whatsapp/instances/${id}`)
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function updateInstanceConfig(id: string, data: Record<string, any>) {
  try {
    return await hubFetch(`/whatsapp/instances/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function getInstanceStatus(id: string) {
  try {
    return await hubFetch(`/whatsapp/instances/${id}/status`)
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function createInstance(name: string) {
  try {
    return await hubFetch('/whatsapp/instances', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function deleteInstance(id: string) {
  try {
    return await hubFetch(`/whatsapp/instances/${id}`, { method: 'DELETE' })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function getInstanceQR(id: string) {
  try {
    return await hubFetch(`/whatsapp/instances/${id}/qr`)
  } catch (e: any) {
    return { error: e.message }
  }
}
