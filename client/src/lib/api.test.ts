import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Stub out the auth store before importing api ──────────────────────────────
vi.mock('../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ token: 'test-token', logout: vi.fn() }),
  },
}))

// Stub window.location (used on 401)
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
})

import { apiFetch, fetchItems, createItem, fetchStats, shareItem, unshareItem } from './api'

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── apiFetch ──────────────────────────────────────────────────────────────────

describe('apiFetch', () => {
  it('attaches Authorization header from auth store token', async () => {
    mockFetch(200, { ok: true })
    await apiFetch('/items')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets Content-Type to application/json', async () => {
    mockFetch(200, {})
    await apiFetch('/items')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].headers['Content-Type']).toBe('application/json')
  })

  it('throws on non-ok response with error message from body', async () => {
    mockFetch(400, { error: 'Bad request' })
    await expect(apiFetch('/items')).rejects.toThrow('Bad request')
  })

  it('throws generic message when error body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
      json: () => Promise.reject(new Error('not json')),
    }) as unknown as typeof fetch
    await expect(apiFetch('/items')).rejects.toThrow()
  })

  it('on 401 redirects to /login', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"Unauthorized"}'),
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    }) as unknown as typeof fetch
    await expect(apiFetch('/items')).rejects.toThrow('Session expired')
    expect(window.location.href).toBe('/login')
  })
})

// ── fetchItems ────────────────────────────────────────────────────────────────

describe('fetchItems', () => {
  it('calls GET /api/items with no query params when no options given', async () => {
    mockFetch(200, { items: [], total: 0 })
    await fetchItems()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items?')
  })

  it('appends type param when provided', async () => {
    mockFetch(200, { items: [], total: 0 })
    await fetchItems({ type: 'recipe' })
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('type=recipe')
  })

  it('appends pendingEnrichment=true when flagged', async () => {
    mockFetch(200, { items: [], total: 0 })
    await fetchItems({ pendingEnrichment: true })
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('pendingEnrichment=true')
  })

  it('appends limit and offset params', async () => {
    mockFetch(200, { items: [], total: 0 })
    await fetchItems({ limit: 10, offset: 20 })
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=20')
  })
})

// ── createItem ────────────────────────────────────────────────────────────────

describe('createItem', () => {
  it('POSTs to /api/items with item body', async () => {
    const item = { title: 'New note', type: 'note' as const, content: 'Hello' }
    mockFetch(201, { id: 'x', ...item })
    await createItem(item as any)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toMatchObject(item)
  })
})

// ── fetchStats ────────────────────────────────────────────────────────────────

describe('fetchStats', () => {
  it('calls GET /api/items/stats', async () => {
    mockFetch(200, { total: 5, byType: {} })
    await fetchStats()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items/stats')
  })
})

// ── shareItem / unshareItem ───────────────────────────────────────────────────

describe('shareItem', () => {
  it('POSTs to /api/items/:id/share', async () => {
    mockFetch(200, { token: 'abc123', expiresAt: new Date().toISOString() })
    await shareItem('item-1')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/item-1/share')
    expect(call[1].method).toBe('POST')
  })
})

describe('unshareItem', () => {
  it('DELETEs /api/items/:id/share', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(undefined),
      text: () => Promise.resolve(''),
    }) as unknown as typeof fetch
    await unshareItem('item-1')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/item-1/share')
    expect(call[1].method).toBe('DELETE')
  })
})
