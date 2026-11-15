import { describe, it, expect } from 'vitest'
import { isBookmarkletRoute, matchesBookmarkletKey, safeEqual, BOOKMARKLET_ROUTES, MIN_BOOKMARKLET_KEY_LENGTH } from './bookmarkletScope'

const KEY = 'a'.repeat(24) + 'b'.repeat(24) // 48 chars, like the generated one

describe('isBookmarkletRoute', () => {
  it('allows exactly the request the bookmarklet makes', () => {
    expect(isBookmarkletRoute('POST', '/api/ingest/quicksave')).toBe(true)
  })

  it('ignores the query string, a trailing slash, method case and path case (Express routes case-insensitively)', () => {
    expect(isBookmarkletRoute('POST', '/api/ingest/quicksave?x=1')).toBe(true)
    expect(isBookmarkletRoute('POST', '/api/ingest/quicksave/')).toBe(true)
    expect(isBookmarkletRoute('post', '/api/ingest/quicksave')).toBe(true)
    expect(isBookmarkletRoute('POST', '/API/INGEST/QuickSave')).toBe(true)
  })

  it('refuses other methods on the same path', () => {
    for (const m of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD']) expect(isBookmarkletRoute(m, '/api/ingest/quicksave')).toBe(false)
  })

  it.each([
    '/api/items', '/api/items/export/obsidian', '/api/items/bulk', '/api/settings', '/api/settings/bookmarklet-key',
    '/api/vault/reset', '/api/vault/status', '/api/ai/keys', '/api/ai/keys/claude', '/api/ingest/text', '/api/ingest/url',
    '/api/ingest/keep/bulk', '/api/ingest/paste/bulk', '/api/ingest/jobs/abc', '/api/search', '/api/categories', '/api/auth/login',
    '/',
  ])('refuses %s', path => {
    expect(isBookmarkletRoute('POST', path)).toBe(false)
    expect(isBookmarkletRoute('GET', path)).toBe(false)
  })

  it('refuses look-alikes and path tricks', () => {
    for (const p of [
      '/api/ingest/quicksave/extra', '/api/ingest/quicksave/../items', '/api/ingest/quicksaves', '/api/ingest/quicksave.json',
      '/api/ingest//quicksave', '/x/api/ingest/quicksave', '/api/ingest/quick', '/api/ingest/quicksave%2F..%2Fitems',
    ]) expect(isBookmarkletRoute('POST', p)).toBe(false)
  })

  it('stays as small as the bookmarklet script: one route', () => {
    expect(BOOKMARKLET_ROUTES).toEqual([{ method: 'POST', path: '/api/ingest/quicksave' }])
  })
})

describe('matchesBookmarkletKey', () => {
  it('accepts the stored key as pg returns it (a bare string, no JSON quotes)', () => {
    expect(matchesBookmarkletKey(KEY, KEY)).toBe(true)
  })

  it('rejects the old JSON-quoted shape, a different key, a prefix and a longer token', () => {
    expect(matchesBookmarkletKey(KEY, JSON.stringify(KEY))).toBe(false)
    expect(matchesBookmarkletKey('c'.repeat(48), KEY)).toBe(false)
    expect(matchesBookmarkletKey(KEY.slice(0, 40), KEY)).toBe(false)
    expect(matchesBookmarkletKey(KEY + 'x', KEY)).toBe(false)
  })

  it('rejects anything but a string value, and keys that are too short', () => {
    for (const v of [null, undefined, 42, {}, [KEY], true]) expect(matchesBookmarkletKey(KEY, v)).toBe(false)
    const short = 's'.repeat(MIN_BOOKMARKLET_KEY_LENGTH - 1)
    expect(matchesBookmarkletKey(short, short)).toBe(false) // a short stored value is never honoured
    expect(matchesBookmarkletKey('', '')).toBe(false)
  })
})

describe('safeEqual', () => {
  it('compares by value', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})
