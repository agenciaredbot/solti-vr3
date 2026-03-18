'use server'

import { hubFetch } from '@/lib/hub'

export async function scrapingCostEstimate(platform: string, maxResults: number) {
  try {
    return await hubFetch('/scraping/cost-estimate', {
      method: 'POST',
      body: JSON.stringify({ platform, maxResults }),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function scrapingStart(body: Record<string, any>) {
  try {
    return await hubFetch('/scraping/start', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function scrapingJobStatus(jobId: string) {
  try {
    return await hubFetch(`/scraping/jobs/${jobId}/status`)
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function scrapingJobResults(jobId: string) {
  try {
    return await hubFetch(`/scraping/jobs/${jobId}/results`)
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function scrapingImport(jobId: string, body: Record<string, any>) {
  try {
    return await hubFetch(`/scraping/jobs/${jobId}/import`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function scrapingEnrich(body: Record<string, any>) {
  try {
    return await hubFetch('/scraping/enrich', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function scrapingEnrichResults(enrichJobId: string) {
  try {
    return await hubFetch(`/scraping/enrich/${enrichJobId}/results`)
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function fetchContacts(limit = 50) {
  try {
    return await hubFetch(`/contacts?limit=${limit}&sortBy=createdAt&sortDir=desc`)
  } catch (e: any) {
    return { error: e.message }
  }
}
