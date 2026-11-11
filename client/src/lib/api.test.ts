import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Stub out the auth store before importing api ──────────────────────────────
// A small mutable stand-in so tests can observe sign-out and token changes.
const auth = vi.hoisted(() => ({
  state: {
    token: 'test-token' as string | null,
    isAuthenticated: true,
    logout: vi.fn(),
    setToken: vi.fn(),
  },
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => auth.state },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Stub window.location so tests can prove a 401 no longer hard-redirects
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
})

import { toast } from 'sonner'
import {
  SessionExpiredError,
  apiFetch, fetchItems, createItem, fetchStats, shareItem, unshareItem,
  ingestUrl, fetchItem, updateItem, deleteItem, deleteItemsBulk,
  migrateToVault, fetchInsights, askKnowledge, fetchRediscovery,
  fetchVisionHealth, fetchWhisperHealth, fetchCategoryAnomalies,
  remapCategory, fetchItemExtractions, applyExtraction, reClassifyItem,
  reprocessBulk, fetchDueReminders, fetchSharedItem, fetchDigest,
  nlFilter, setReminder, fetchSearch, fetchCategories, fetchTags,
} from './api'

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch
}

const { logout, setToken } = auth.state

beforeEach(() => {
  vi.clearAllMocks()
  window.location.href = ''
  auth.state.token = 'test-token'
  auth.state.isAuthenticated = true
  // Behave like the real store: logging out clears the session.
  logout.mockImplementation(() => { auth.state.isAuthenticated = false; auth.state.token = null })
  setToken.mockImplementation((t: string) => { auth.state.token = t })
})

/** Builds an unsigned JWT-shaped string with the given exp (seconds). */
function jwtWithExp(exp: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64({ userId: 'u1', exp })}.sig`
}

function responseWith(status: number, headers: Record<string, string> = {}, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase()) ?? ''] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }
}

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

  describe('on 401 (session expired)', () => {
    const unauthorized = () => responseWith(401, {}, { error: 'Unauthorized' })

    it('signs out and throws SessionExpiredError without a hard redirect', async () => {
      global.fetch = vi.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch

      const err = (await apiFetch('/items').catch((e: unknown) => e)) as Error
      expect(err).toBeInstanceOf(SessionExpiredError)
      expect(err.message).toBe('Session expired')
      expect(logout).toHaveBeenCalledTimes(1)
      // ProtectedRoute handles the redirect softly; no full page reload
      expect(window.location.href).toBe('')
    })

    it('tells the user why they were signed out, once', async () => {
      global.fetch = vi.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch
      await apiFetch('/items').catch(() => {})
      expect(toast.error).toHaveBeenCalledTimes(1)
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/session expired/i),
        expect.objectContaining({ id: 'session-expired' }),
      )
    })

    it('handles several simultaneous 401s once', async () => {
      global.fetch = vi.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch
      const results = await Promise.allSettled([apiFetch('/items'), apiFetch('/stats'), apiFetch('/tags')])

      expect(results.every(r => r.status === 'rejected')).toBe(true)
      expect(results.every(r => r.status === 'rejected' && r.reason instanceof SessionExpiredError)).toBe(true)
      expect(logout).toHaveBeenCalledTimes(1)
      expect(toast.error).toHaveBeenCalledTimes(1)
    })

    it('ignores a late 401 for a token that was replaced by a newer sign-in', async () => {
      // Request starts with 'test-token'; before its 401 arrives the user signs in again.
      global.fetch = vi.fn().mockImplementation(async () => {
        auth.state.token = 'brand-new-token'
        return unauthorized()
      }) as unknown as typeof fetch

      await expect(apiFetch('/items')).rejects.toBeInstanceOf(SessionExpiredError)
      expect(logout).not.toHaveBeenCalled()
      expect(auth.state.isAuthenticated).toBe(true)
    })

    it('does nothing for a 401 when already signed out (no token sent)', async () => {
      auth.state.token = null
      auth.state.isAuthenticated = false
      global.fetch = vi.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch

      await expect(apiFetch('/items')).rejects.toBeInstanceOf(SessionExpiredError)
      expect(logout).not.toHaveBeenCalled()
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('does not sign out on a 401 from the auth endpoints (wrong password)', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        responseWith(401, {}, { error: 'Invalid credentials' }),
      ) as unknown as typeof fetch

      await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toThrow('Invalid credentials')
      expect(logout).not.toHaveBeenCalled()
      expect(toast.error).not.toHaveBeenCalled()
    })
  })

  describe('sliding session (renewed token)', () => {
    const NOW = 1_800_000_000

    it('adopts a renewed token that expires later than the current one', async () => {
      auth.state.token = jwtWithExp(NOW + 3600)
      const renewed = jwtWithExp(NOW + 7 * 86400)
      global.fetch = vi.fn().mockResolvedValue(
        responseWith(200, { 'X-Refreshed-Token': renewed }),
      ) as unknown as typeof fetch

      await apiFetch('/items')
      expect(setToken).toHaveBeenCalledWith(renewed)
    })

    it('ignores an older token replayed from the service worker cache', async () => {
      auth.state.token = jwtWithExp(NOW + 6 * 86400)
      global.fetch = vi.fn().mockResolvedValue(
        responseWith(200, { 'X-Refreshed-Token': jwtWithExp(NOW + 3600) }),
      ) as unknown as typeof fetch

      await apiFetch('/items')
      expect(setToken).not.toHaveBeenCalled()
    })

    it('ignores a renewed token that is not a valid JWT', async () => {
      auth.state.token = jwtWithExp(NOW)
      global.fetch = vi.fn().mockResolvedValue(
        responseWith(200, { 'X-Refreshed-Token': 'garbage' }),
      ) as unknown as typeof fetch

      await apiFetch('/items')
      expect(setToken).not.toHaveBeenCalled()
    })

    it('adopts a renewed token when the current token cannot be decoded', async () => {
      auth.state.token = 'opaque-legacy-token'
      const renewed = jwtWithExp(NOW)
      global.fetch = vi.fn().mockResolvedValue(
        responseWith(200, { 'X-Refreshed-Token': renewed }),
      ) as unknown as typeof fetch

      await apiFetch('/items')
      expect(setToken).toHaveBeenCalledWith(renewed)
    })

    it('does nothing when the response carries no renewed token', async () => {
      global.fetch = vi.fn().mockResolvedValue(responseWith(200)) as unknown as typeof fetch
      await apiFetch('/items')
      expect(setToken).not.toHaveBeenCalled()
    })
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

// ── ingestUrl ─────────────────────────────────────────────────────────────────

describe('ingestUrl', () => {
  it('POSTs to /api/ingest/url with url body', async () => {
    mockFetch(200, { id: 'x', status: 'ok' })
    await ingestUrl('https://example.com')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/ingest/url')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ url: 'https://example.com' })
  })
})

// ── fetchItem ─────────────────────────────────────────────────────────────────

describe('fetchItem', () => {
  it('GETs /api/items/:id', async () => {
    mockFetch(200, { id: 'abc', title: 'Test' })
    await fetchItem('abc')
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items/abc')
  })
})

// ── updateItem ────────────────────────────────────────────────────────────────

describe('updateItem', () => {
  it('PUTs to /api/items/:id with updates body', async () => {
    mockFetch(200, { id: 'abc', title: 'Updated' })
    await updateItem('abc', { title: 'Updated' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/abc')
    expect(call[1].method).toBe('PUT')
    expect(JSON.parse(call[1].body)).toEqual({ title: 'Updated' })
  })
})

// ── deleteItem ────────────────────────────────────────────────────────────────

describe('deleteItem', () => {
  it('DELETEs /api/items/:id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 204,
      json: () => Promise.resolve(undefined),
      text: () => Promise.resolve(''),
    }) as unknown as typeof fetch
    await deleteItem('abc')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/abc')
    expect(call[1].method).toBe('DELETE')
  })
})

// ── deleteItemsBulk ───────────────────────────────────────────────────────────

describe('deleteItemsBulk', () => {
  it('DELETEs /api/items/bulk with ids array', async () => {
    mockFetch(200, { count: 2 })
    await deleteItemsBulk(['a', 'b'])
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/bulk')
    expect(call[1].method).toBe('DELETE')
    expect(JSON.parse(call[1].body)).toEqual({ ids: ['a', 'b'] })
  })
})

// ── migrateToVault ────────────────────────────────────────────────────────────

describe('migrateToVault', () => {
  it('POSTs to /api/vault/migrate/:id with vault data', async () => {
    mockFetch(200, { id: 'v1' })
    const data = { service: 'GitHub', ciphertext: 'ct', iv: 'iv' }
    await migrateToVault('item-1', data)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/vault/migrate/item-1')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toMatchObject(data)
  })
})

// ── fetchInsights ─────────────────────────────────────────────────────────────

describe('fetchInsights', () => {
  it('GETs /api/items/insights', async () => {
    mockFetch(200, [])
    await fetchInsights()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items/insights')
  })
})

// ── askKnowledge ──────────────────────────────────────────────────────────────

describe('askKnowledge', () => {
  it('POSTs to /api/search/ask with question', async () => {
    mockFetch(200, { answer: 'Yes', sources: [] })
    await askKnowledge('What is Memex?')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/search/ask')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ question: 'What is Memex?' })
  })
})

// ── fetchRediscovery ──────────────────────────────────────────────────────────

describe('fetchRediscovery', () => {
  it('GETs /api/items/rediscover', async () => {
    mockFetch(200, [])
    await fetchRediscovery()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items/rediscover')
  })
})

// ── fetchVisionHealth / fetchWhisperHealth ────────────────────────────────────

describe('fetchVisionHealth', () => {
  it('GETs /api/ingest/vision/health', async () => {
    mockFetch(200, { available: true, model: 'llava' })
    await fetchVisionHealth()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/ingest/vision/health')
  })
})

describe('fetchWhisperHealth', () => {
  it('GETs /api/ingest/whisper/health', async () => {
    mockFetch(200, { installed: false })
    await fetchWhisperHealth()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/ingest/whisper/health')
  })
})

// ── fetchCategoryAnomalies / remapCategory ────────────────────────────────────

describe('fetchCategoryAnomalies', () => {
  it('GETs /api/categories/anomalies', async () => {
    mockFetch(200, [])
    await fetchCategoryAnomalies()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/categories/anomalies')
  })
})

describe('remapCategory', () => {
  it('POSTs to /api/categories/remap with fromRootId and toPath', async () => {
    mockFetch(200, { moved: 3 })
    await remapCategory('root-1', ['Food', 'Savory'])
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/categories/remap')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ fromRootId: 'root-1', toPath: ['Food', 'Savory'] })
  })
})

// ── fetchItemExtractions / applyExtraction / reClassifyItem ──────────────────

describe('fetchItemExtractions', () => {
  it('GETs /api/items/:id/extractions', async () => {
    mockFetch(200, [])
    await fetchItemExtractions('item-1')
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items/item-1/extractions')
  })
})

describe('applyExtraction', () => {
  it('POSTs to /api/items/:id/apply-extraction/:extractionId', async () => {
    mockFetch(200, { id: 'item-1' })
    await applyExtraction('item-1', 'ext-9')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/item-1/apply-extraction/ext-9')
    expect(call[1].method).toBe('POST')
  })
})

describe('reClassifyItem', () => {
  it('POSTs to /api/items/:id/re-classify', async () => {
    mockFetch(200, { id: 'ext-new' })
    await reClassifyItem('item-1')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/item-1/re-classify')
    expect(call[1].method).toBe('POST')
  })
})

// ── reprocessBulk ─────────────────────────────────────────────────────────────

describe('reprocessBulk', () => {
  it('POSTs to /api/items/reprocess-bulk with default filter=unreviewed', async () => {
    mockFetch(200, { queued: 5 })
    await reprocessBulk()
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/reprocess-bulk')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ filter: 'unreviewed' })
  })

  it('passes filter=all when specified', async () => {
    mockFetch(200, { queued: 10 })
    await reprocessBulk('all')
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ filter: 'all' })
  })
})

// ── fetchDueReminders ─────────────────────────────────────────────────────────

describe('fetchDueReminders', () => {
  it('GETs /api/items/reminders/due', async () => {
    mockFetch(200, [])
    await fetchDueReminders()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items/reminders/due')
  })
})

// ── fetchSharedItem ───────────────────────────────────────────────────────────

describe('fetchSharedItem', () => {
  it('GETs /api/share/:token without auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: 'x', title: 'Shared' }),
    }) as unknown as typeof fetch
    await fetchSharedItem('tok123')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/share/tok123')
    // No Authorization header in the direct fetch call
    expect(call[1]).toBeUndefined()
  })

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
    }) as unknown as typeof fetch
    await expect(fetchSharedItem('bad-token')).rejects.toThrow('Not found')
  })
})

// ── fetchDigest ───────────────────────────────────────────────────────────────

describe('fetchDigest', () => {
  it('GETs /api/items/digest', async () => {
    mockFetch(200, { items: [] })
    await fetchDigest()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/items/digest')
  })
})

// ── nlFilter ──────────────────────────────────────────────────────────────────

describe('nlFilter', () => {
  it('POSTs to /api/items/nl-filter with query', async () => {
    mockFetch(200, { items: [], interpretation: 'ok' })
    await nlFilter('show me thai recipes')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/nl-filter')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ query: 'show me thai recipes' })
  })
})

// ── setReminder ───────────────────────────────────────────────────────────────

describe('setReminder', () => {
  it('PUTs remindAt to /api/items/:id', async () => {
    mockFetch(200, { id: 'item-1' })
    await setReminder('item-1', '2025-12-01T09:00:00Z')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/items/item-1')
    expect(call[1].method).toBe('PUT')
    expect(JSON.parse(call[1].body)).toEqual({ remindAt: '2025-12-01T09:00:00Z' })
  })

  it('clears reminder when remindAt is null', async () => {
    mockFetch(200, { id: 'item-1' })
    await setReminder('item-1', null)
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ remindAt: null })
  })
})

// ── fetchSearch ───────────────────────────────────────────────────────────────

describe('fetchSearch', () => {
  it('POSTs to /api/search with query', async () => {
    mockFetch(200, { items: [] })
    await fetchSearch('curry recipe')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/search')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toMatchObject({ query: 'curry recipe' })
  })

  it('passes type filter when provided', async () => {
    mockFetch(200, { items: [] })
    await fetchSearch('curry', { type: 'recipe' })
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toMatchObject({ type: 'recipe' })
  })
})

// ── fetchCategories / fetchTags ───────────────────────────────────────────────

describe('fetchCategories', () => {
  it('GETs /api/categories', async () => {
    mockFetch(200, [])
    await fetchCategories()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/categories')
  })
})

describe('fetchTags', () => {
  it('GETs /api/tags', async () => {
    mockFetch(200, [])
    await fetchTags()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/tags')
  })
})
