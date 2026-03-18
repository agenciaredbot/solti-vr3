'use server'

import { hubFetch } from '@/lib/hub'

interface ContactParams {
  page?: number
  limit?: number
  status?: string
  source?: string
  search?: string
  tag?: string
  city?: string
  country?: string
  sortBy?: string
  sortDir?: string
}

export async function fetchContacts(params: ContactParams = {}) {
  try {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
    return await hubFetch(`/contacts?${qs.toString()}`)
  } catch (e: any) {
    return { data: [], pagination: { total: 0, page: 1, limit: 25, pages: 0 }, error: e.message }
  }
}

export async function updateContactStatus(contactId: string, status: string) {
  try {
    return await hubFetch(`/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function addTagToContact(contactId: string, tagName: string, tagColor?: string) {
  try {
    return await hubFetch(`/contacts/${contactId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name: tagName, color: tagColor || '#6366f1' }),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  try {
    return await hubFetch(`/contacts/${contactId}/tags/${tagId}`, { method: 'DELETE' })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function fetchTags() {
  try {
    return await hubFetch('/tags')
  } catch (e: any) {
    return { data: [], error: e.message }
  }
}

export async function createTag(name: string, color?: string) {
  try {
    return await hubFetch('/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color: color || '#6366f1' }),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function createListWithContacts(name: string, description: string | undefined, contactIds: string[]) {
  try {
    const listRes = await hubFetch('/lists', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    })
    const listId = (listRes.data || listRes).id
    if (contactIds.length > 0) {
      await hubFetch(`/lists/${listId}/members`, {
        method: 'POST',
        body: JSON.stringify({ contactIds }),
      })
    }
    return { data: { listId, name, contactCount: contactIds.length } }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function createSmartList(name: string, description: string | undefined, filters: Record<string, any>) {
  try {
    const listRes = await hubFetch('/lists', {
      method: 'POST',
      body: JSON.stringify({ name, description, isDynamic: true, filters }),
    })
    const listId = (listRes.data || listRes).id
    const popRes = await hubFetch(`/lists/${listId}/populate`, {
      method: 'POST',
      body: JSON.stringify(filters),
    })
    return { data: { listId, name, populated: (popRes.data || popRes).added || 0 } }
  } catch (e: any) {
    return { error: e.message }
  }
}
