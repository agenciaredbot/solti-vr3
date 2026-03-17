/**
 * getLate Adapter — Social media publishing
 *
 * Gotchas:
 * - Base URL: https://getlate.dev/api/v1 (NOT api.getlate.com)
 * - Auth: Authorization: Bearer {token}
 * - Posting uses `platforms` array (NOT `accountIds`)
 * - Media upload via presigned URLs: POST /v1/media/presign
 *   → fields: filename, contentType
 * - Media attach: mediaItems array with {url, type}
 */

import type { ServiceAdapter, AdapterResult } from './adapter.interface.js'

const BASE_URL = 'https://getlate.dev/api/v1'

export class GetLateAdapter implements ServiceAdapter {
  readonly name = 'getlate'

  async testConnection(apiKey: string): Promise<boolean> {
    const res = await fetch(`${BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return res.ok
  }

  async execute(apiKey: string, action: string, params: Record<string, unknown>): Promise<AdapterResult> {
    switch (action) {
      case 'list_accounts':
        return this.listAccounts(apiKey)
      case 'create_post':
        return this.createPost(apiKey, params)
      case 'presign_media':
        return this.presignMedia(apiKey, params)
      case 'list_posts':
        return this.listPosts(apiKey, params)
      case 'update_post':
        return this.updatePost(apiKey, params)
      case 'publish_post':
        return this.publishPost(apiKey, params)
      default:
        throw new Error(`Unknown getLate action: ${action}`)
    }
  }

  getActions(): string[] {
    return ['list_accounts', 'create_post', 'presign_media', 'list_posts', 'update_post', 'publish_post']
  }

  private async listAccounts(apiKey: string): Promise<AdapterResult> {
    const res = await fetch(`${BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) throw new Error(`getLate accounts failed: ${res.status}`)

    const data = await res.json() as any
    const accounts = data.data || data.accounts || data || []
    const list = Array.isArray(accounts) ? accounts : []

    return {
      success: true,
      data: { accounts: list, total: list.length },
      cost: 0,
      description: `${list.length} connected accounts`,
    }
  }

  private async createPost(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    // getLate API expects: content (not text), platforms[].accountId + platforms[].platform
    const textContent = (params.text as string) || (params.content as string) || ''

    // Normalize platforms array: accept both {accountId, platform} and {platformAccountId, platformId}
    const rawPlatforms = params.platforms as Array<Record<string, string>> || []
    const platforms = rawPlatforms.map(p => ({
      accountId: p.accountId || p.platformAccountId,
      platform: p.platform || p.platformId,
    }))

    const body: Record<string, unknown> = {
      content: textContent,
      platforms,
    }

    // Schedule for later
    if (params.scheduledAt) {
      body.scheduledAt = params.scheduledAt
    }

    // Attach media via mediaItems (presigned URLs)
    if (params.mediaItems) {
      body.mediaItems = params.mediaItems
    }

    // Status: default to 'scheduled' if scheduledAt provided, else 'draft'
    if (params.status) {
      body.status = params.status
    }

    // Publish immediately
    if (params.publishNow) {
      body.publishNow = true
    }

    // Schedule for specific time (getLate uses scheduledFor, not scheduledAt)
    if (params.scheduledFor) {
      body.scheduledFor = params.scheduledFor
    }

    const res = await fetch(`${BASE_URL}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`getLate post failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data,
      cost: 0.10,
      description: `Post created/scheduled`,
    }
  }

  private async presignMedia(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const body = {
      filename: params.filename as string,
      contentType: params.contentType as string || 'image/png',
    }

    const res = await fetch(`${BASE_URL}/media/presign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`getLate presign failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data,
      cost: 0,
      description: `Presigned URL generated for ${params.filename}`,
    }
  }

  private async updatePost(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const postId = params.postId as string
    if (!postId) throw new Error('postId is required')

    const body: Record<string, unknown> = {}
    if (params.content) body.content = params.content
    if (params.status) body.status = params.status
    if (params.scheduledAt) body.scheduledAt = params.scheduledAt
    if (params.mediaItems) body.mediaItems = params.mediaItems

    const res = await fetch(`${BASE_URL}/posts/${postId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`getLate update failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return { success: true, data, cost: 0, description: `Post ${postId} updated` }
  }

  private async publishPost(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const postId = params.postId as string
    if (!postId) throw new Error('postId is required')

    // Try POST /posts/:id/publish first, fallback to PATCH status
    const res = await fetch(`${BASE_URL}/posts/${postId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      // Fallback: PATCH status to 'scheduled' (immediate)
      const fallback = await fetch(`${BASE_URL}/posts/${postId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'scheduled', scheduledAt: new Date().toISOString() }),
      })

      if (!fallback.ok) {
        const err = await fallback.text()
        throw new Error(`getLate publish failed: ${fallback.status} ${err.slice(0, 200)}`)
      }

      const data = await fallback.json() as any
      return { success: true, data, cost: 0.10, description: `Post ${postId} scheduled for immediate publish` }
    }

    const data = await res.json() as any
    return { success: true, data, cost: 0.10, description: `Post ${postId} published` }
  }

  private async listPosts(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const limit = (params.limit as number) || 10
    const res = await fetch(`${BASE_URL}/posts?limit=${limit}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) throw new Error(`getLate posts failed: ${res.status}`)

    const data = await res.json() as any
    return {
      success: true,
      data,
      cost: 0,
      description: `Posts listed`,
    }
  }
}
