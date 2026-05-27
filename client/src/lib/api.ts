import type { 
  IngestUrlRequest, 
  IngestUrlResponse, 
  CreateItemRequest, 
  Item,
  StatsResponse
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

export async function fetchItems(options: { type?: string, category?: string, tag?: string, limit?: number, offset?: number } = {}): Promise<{ items: Item[], total: number }> {
  const params = new URLSearchParams()
  if (options.type) params.append('type', options.type)
  if (options.category) params.append('category', options.category)
  if (options.tag) params.append('tag', options.tag)
  if (options.limit) params.append('limit', options.limit.toString())
  if (options.offset) params.append('offset', options.offset.toString())

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

export async function fetchStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>('/items/stats')
}
