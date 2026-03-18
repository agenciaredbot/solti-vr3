/**
 * Apify Adapter — Scraping, Enrichment + Instagram DMs
 *
 * Gotchas:
 * - Actor IDs use `~` not `/` in URL paths (e.g. compass~crawler-google-places)
 * - Bearer token auth
 * - Runs are async — start returns runId, poll for completion
 *
 * Supported actions:
 * - scrape_google_maps   — Google Places via compass~crawler-google-places
 * - scrape_instagram     — IG profiles/hashtags via apify~instagram-scraper
 * - scrape_linkedin      — LinkedIn search via anchor~linkedin-search
 * - scrape_website       — Generic web scraping via apify~web-scraper
 * - enrich_contacts      — Email/phone extraction via epctex~contact-info-scraper
 * - send_instagram_dm    — Bulk IG DMs via mikolabs~instagram-bulk-dm
 * - get_run_status       — Poll run progress
 * - get_run_results      — Fetch dataset items
 */

import type { ServiceAdapter, AdapterResult } from './adapter.interface.js'

const BASE_URL = 'https://api.apify.com/v2'

export class ApifyAdapter implements ServiceAdapter {
  readonly name = 'apify'

  async testConnection(apiKey: string): Promise<boolean> {
    const res = await fetch(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return res.ok
  }

  async execute(apiKey: string, action: string, params: Record<string, unknown>): Promise<AdapterResult> {
    switch (action) {
      case 'scrape_google_maps':
        return this.scrapeGoogleMaps(apiKey, params)
      case 'scrape_instagram':
        return this.scrapeInstagram(apiKey, params)
      case 'send_instagram_dm':
        return this.sendInstagramDm(apiKey, params)
      case 'scrape_linkedin':
        return this.scrapeLinkedIn(apiKey, params)
      case 'scrape_tiktok':
        return this.scrapeTikTok(apiKey, params)
      case 'scrape_website':
        return this.scrapeWebsite(apiKey, params)
      case 'enrich_contacts':
        return this.enrichContacts(apiKey, params)
      case 'get_run_status':
        return this.getRunStatus(apiKey, params)
      case 'get_run_results':
        return this.getRunResults(apiKey, params)
      default:
        throw new Error(`Unknown Apify action: ${action}`)
    }
  }

  getActions(): string[] {
    return [
      'scrape_google_maps', 'scrape_instagram', 'scrape_linkedin', 'scrape_tiktok',
      'scrape_website', 'enrich_contacts', 'send_instagram_dm', 'get_run_status', 'get_run_results',
    ]
  }

  private async scrapeGoogleMaps(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    // Actor: compass~crawler-google-places (note: ~ not /)
    const actorId = 'compass~crawler-google-places'
    const searchQuery = (params.searchQuery || params.query) as string
    const location = (params.location || 'Colombia') as string
    const maxResults = (params.maxResults || params.max || 100) as number

    const input = {
      searchStringsArray: [searchQuery],
      locationQuery: location,
      maxCrawledPlacesPerSearch: maxResults,
      language: 'es',
    }

    const res = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Apify scrape failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: {
        runId: data.data?.id,
        datasetId: data.data?.defaultDatasetId,
        status: data.data?.status,
      },
      cost: 0.50,
      description: `Started Google Maps scrape: "${searchQuery}" in ${location}`,
    }
  }

  private async scrapeInstagram(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const actorId = 'apify~instagram-scraper'
    const input = {
      directUrls: params.urls as string[] || [],
      resultsLimit: (params.max as number) || 50,
      searchType: params.searchType || 'user',
      searchLimit: (params.max as number) || 50,
    }

    if (params.query) {
      (input as any).search = params.query
    }

    const res = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) throw new Error(`Apify IG scrape failed: ${res.status}`)

    const data = await res.json() as any
    return {
      success: true,
      data: { runId: data.data?.id, datasetId: data.data?.defaultDatasetId },
      cost: 0.30,
      description: `Started Instagram scrape`,
    }
  }

  private async sendInstagramDm(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    // Actor: mikolabs~instagram-bulk-dm (note: ~ not /)
    const actorId = 'mikolabs~instagram-bulk-dm'
    const input = {
      usernames: params.usernames as string[] || [],
      message: params.message as string,
    }

    const res = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) throw new Error(`Apify IG DM failed: ${res.status}`)

    const data = await res.json() as any
    return {
      success: true,
      data: { runId: data.data?.id },
      cost: 0.80,
      description: `Started Instagram DM to ${(params.usernames as string[])?.length || 0} users`,
    }
  }

  private async scrapeLinkedIn(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const actorId = 'anchor~linkedin-search'
    const searchUrl = params.searchUrl as string
    if (!searchUrl) throw new Error('searchUrl is required for LinkedIn scraping')

    const maxResults = (params.maxResults || params.max || 100) as number

    const input = {
      searchUrl,
      maxResults,
    }

    const res = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Apify LinkedIn scrape failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: {
        runId: data.data?.id,
        datasetId: data.data?.defaultDatasetId,
        status: data.data?.status,
      },
      cost: 0.50,
      description: `Started LinkedIn scrape (max ${maxResults} results)`,
    }
  }

  private async scrapeTikTok(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const actorId = 'clockworks~tiktok-scraper'
    const query = (params.query || params.searchQuery) as string
    if (!query) throw new Error('query is required for TikTok scraping')

    const maxResults = (params.maxResults || params.max || 50) as number

    const input = {
      searchQueries: [query],
      resultsPerPage: maxResults,
    }

    const res = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Apify TikTok scrape failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: {
        runId: data.data?.id,
        datasetId: data.data?.defaultDatasetId,
        status: data.data?.status,
      },
      cost: 0.30,
      description: `Started TikTok scrape: "${query}" (max ${maxResults})`,
    }
  }

  private async scrapeWebsite(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const actorId = 'apify~web-scraper'
    const startUrls = (params.startUrls || params.urls) as string[]
    if (!startUrls?.length) throw new Error('startUrls is required for website scraping')

    const maxResults = (params.maxResults || params.max || 100) as number

    const input = {
      startUrls: startUrls.map(url => ({ url })),
      maxPagesPerCrawl: maxResults,
      pageFunction: `async function pageFunction(context) {
        const { request, log, jQuery } = context;
        const $ = jQuery;
        const title = $('title').text().trim();
        const emails = $('body').text().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [];
        const phones = $('body').text().match(/[+]?[\\d\\s()-]{7,15}/g) || [];
        return {
          url: request.url,
          title,
          emails: [...new Set(emails)],
          phones: [...new Set(phones.map(p => p.trim()))],
        };
      }`,
    }

    const res = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Apify web scrape failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: {
        runId: data.data?.id,
        datasetId: data.data?.defaultDatasetId,
        status: data.data?.status,
      },
      cost: 0.20,
      description: `Started website scrape on ${startUrls.length} URL(s)`,
    }
  }

  private async enrichContacts(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const actorId = 'epctex~contact-info-scraper'
    const urls = params.urls as string[]
    if (!urls?.length) throw new Error('urls is required for contact enrichment')

    const input = {
      startUrls: urls.map(url => ({ url })),
    }

    const res = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Apify enrichment failed: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = await res.json() as any
    return {
      success: true,
      data: {
        runId: data.data?.id,
        datasetId: data.data?.defaultDatasetId,
        status: data.data?.status,
      },
      cost: 0.40,
      description: `Started contact enrichment for ${urls.length} URL(s)`,
    }
  }

  private async getRunStatus(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const runId = params.runId as string
    const res = await fetch(`${BASE_URL}/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) throw new Error(`Apify run status failed: ${res.status}`)

    const data = await res.json() as any
    return {
      success: true,
      data: {
        status: data.data?.status,
        startedAt: data.data?.startedAt,
        finishedAt: data.data?.finishedAt,
        datasetId: data.data?.defaultDatasetId,
      },
      cost: 0,
      description: `Run ${runId}: ${data.data?.status}`,
    }
  }

  private async getRunResults(apiKey: string, params: Record<string, unknown>): Promise<AdapterResult> {
    let datasetId = params.datasetId as string | undefined
    const runId = params.runId as string | undefined
    const limit = (params.limit as number) || 100

    // If only runId provided, fetch the datasetId from the run info
    if (!datasetId && runId) {
      const runRes = await fetch(`${BASE_URL}/actor-runs/${runId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (runRes.ok) {
        const runData = await runRes.json() as any
        datasetId = runData.data?.defaultDatasetId
      }
    }

    if (!datasetId) throw new Error('datasetId or runId required to fetch results')

    const res = await fetch(`${BASE_URL}/datasets/${datasetId}/items?limit=${limit}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) throw new Error(`Apify results failed: ${res.status}`)

    const items = await res.json() as any[]
    return {
      success: true,
      data: { items, count: items.length },
      cost: 0,
      description: `Fetched ${items.length} results from dataset`,
    }
  }
}
