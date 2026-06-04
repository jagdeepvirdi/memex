import type {
  IngestUrlRequest,
  IngestUrlResponse,
  CreateItemRequest,
  Item,
  StatsResponse,
  Insight,
  AskRequest,
  AskResponse,
  RediscoveryItem,
  CategoryAnomaly,
  RemapCategoryResponse,
  ItemExtraction,
  SimilarItem,
  NLFilterResponse,
  DigestResponse,
} from '../../../shared/types'
import { useAuthStore } from '../store/authStore'

const BASE = '/api'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...init?.headers as Record<string, string>
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  })

  if (res.status === 401 && !path.startsWith('/auth')) {
    useAuthStore.getState().logout()
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const text = await res.text();
    let error;
    try {
      error = JSON.parse(text).error;
    } catch {
      error = text;
    }
    throw new Error(error || `API error ${res.status}`);
  }
  if (res.status === 204 || res.headers?.get('content-length') === '0') return undefined as T
  return res.json() as Promise<T>
}

export async function ingestUrl(url: string): Promise<IngestUrlResponse> {
  return apiFetch<IngestUrlResponse>('/ingest/url', {
    method: 'POST',
    body: JSON.stringify({ url } as IngestUrlRequest),
  })
}

export async function createItem(item: CreateItemRequest): Promise<Item> {
  return apiFetch<Item>('/items', {
    method: 'POST',
    body: JSON.stringify(item),
  })
}

export async function fetchItems(options: { type?: string, category?: string, tag?: string, limit?: number, offset?: number, pendingEnrichment?: boolean, enriched?: boolean, q?: string, unreviewed?: boolean, hasReminder?: boolean } = {}): Promise<{ items: Item[], total: number }> {
  const params = new URLSearchParams()
  if (options.type) params.append('type', options.type)
  if (options.category) params.append('category', options.category)
  if (options.tag) params.append('tag', options.tag)
  if (options.limit) params.append('limit', options.limit.toString())
  if (options.offset) params.append('offset', options.offset.toString())
  if (options.pendingEnrichment) params.append('pendingEnrichment', 'true')
  if (options.enriched) params.append('enriched', 'true')
  if (options.unreviewed) params.append('unreviewed', 'true')
  if (options.hasReminder) params.append('hasReminder', 'true')
  if (options.q) params.append('q', options.q)

  return apiFetch<{ items: Item[], total: number }>(`/items?${params.toString()}`)
}

export async function fetchSearch(query: string, options: { type?: string, category?: string, tag?: string } = {}): Promise<Item[]> {
  const data = await apiFetch<{ items: Item[] }>('/search', {
    method: 'POST',
    body: JSON.stringify({ query, ...options }),
  })
  return data.items
}

export async function fetchCategories(): Promise<any[]> {
  return apiFetch<any[]>('/categories')
}

export async function fetchTags(): Promise<any[]> {
  return apiFetch<any[]>('/tags')
}

export async function fetchItem(id: string): Promise<Item> {
  return apiFetch<Item>(`/items/${id}`)
}

export async function updateItem(id: string, updates: Partial<Item>): Promise<Item> {
  return apiFetch<Item>(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteItem(id: string): Promise<void> {
  await apiFetch<void>(`/items/${id}`, {
    method: 'DELETE',
  })
}

export async function deleteItemsBulk(ids: string[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(`/items/bulk`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export async function migrateToVault(itemId: string, data: { service: string, url?: string, username?: string, ciphertext: string, iv: string }): Promise<any> {
  return apiFetch<any>(`/vault/migrate/${itemId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function fetchStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>('/items/stats')
}

export async function fetchInsights(): Promise<Insight[]> {
  return apiFetch<Insight[]>('/items/insights')
}

export async function askKnowledge(question: string): Promise<AskResponse> {
  return apiFetch<AskResponse>('/search/ask', {
    method: 'POST',
    body: JSON.stringify({ question } as AskRequest),
  })
}

export async function fetchRediscovery(): Promise<RediscoveryItem[]> {
  return apiFetch<RediscoveryItem[]>('/items/rediscover')
}

export type { SimilarItem }

export async function fetchVisionHealth(): Promise<{ available: boolean; model: string | null }> {
  return apiFetch<{ available: boolean; model: string | null }>('/ingest/vision/health')
}

export async function fetchWhisperHealth(): Promise<{ installed: boolean }> {
  return apiFetch<{ installed: boolean }>('/ingest/whisper/health')
}

export async function fetchCategoryAnomalies(): Promise<CategoryAnomaly[]> {
  return apiFetch<CategoryAnomaly[]>('/categories/anomalies')
}

export async function remapCategory(fromRootId: string, toPath: string[]): Promise<RemapCategoryResponse> {
  return apiFetch<RemapCategoryResponse>('/categories/remap', {
    method: 'POST',
    body: JSON.stringify({ fromRootId, toPath }),
  })
}

export async function fetchItemExtractions(itemId: string): Promise<ItemExtraction[]> {
  return apiFetch<ItemExtraction[]>(`/items/${itemId}/extractions`)
}

export async function applyExtraction(itemId: string, extractionId: string): Promise<Item> {
  return apiFetch<Item>(`/items/${itemId}/apply-extraction/${extractionId}`, { method: 'POST' })
}

export async function fetchDueReminders(): Promise<Item[]> {
  return apiFetch<Item[]>('/items/reminders/due')
}

export async function shareItem(itemId: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>(`/items/${itemId}/share`, { method: 'POST' })
}

export async function unshareItem(itemId: string): Promise<void> {
  await apiFetch<void>(`/items/${itemId}/share`, { method: 'DELETE' })
}

export async function fetchSharedItem(token: string): Promise<Item> {
  // Public endpoint — no auth header needed
  const res = await fetch(`/api/share/${token}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Not found')
  return res.json()
}

export async function fetchDigest(): Promise<DigestResponse> {
  return apiFetch<DigestResponse>('/items/digest')
}

export async function nlFilter(query: string): Promise<NLFilterResponse> {
  return apiFetch<NLFilterResponse>('/items/nl-filter', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export async function setReminder(itemId: string, remindAt: string | null): Promise<Item> {
  return apiFetch<Item>(`/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ remindAt }),
  })
}
