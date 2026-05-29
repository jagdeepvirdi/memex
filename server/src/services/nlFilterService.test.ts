import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseNLFilter } from './nlFilterService'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))

import { aiChat } from './ai'

const mockAI = (response: string) => vi.mocked(aiChat).mockResolvedValueOnce(response)

beforeEach(() => vi.clearAllMocks())

describe('parseNLFilter', () => {
  it('parses a well-formed place filter', async () => {
    mockAI(JSON.stringify({
      type: 'place',
      searchQuery: '',
      structuredFilters: { cuisine: 'Thai', visitStatus: 'want-to-visit' },
    }))
    const r = await parseNLFilter("thai restaurants I haven't visited")
    expect(r.type).toBe('place')
    expect(r.searchQuery).toBe('')
    expect(r.structuredFilters).toEqual({ cuisine: 'Thai', visitStatus: 'want-to-visit' })
  })

  it('keeps a valid search query and trims it', async () => {
    mockAI(JSON.stringify({ type: 'recipe', searchQuery: '  sourdough  ', structuredFilters: {} }))
    const r = await parseNLFilter('sourdough recipes')
    expect(r.type).toBe('recipe')
    expect(r.searchQuery).toBe('sourdough')
  })

  // ── Security: field whitelist ────────────────────────────────────────────────

  it('drops structured fields not in the SAFE_FIELDS whitelist', async () => {
    mockAI(JSON.stringify({
      type: 'place',
      searchQuery: '',
      // cuisine is allowed; the others are injection attempts / unknown keys
      structuredFilters: {
        cuisine: 'Thai',
        "password'); DROP TABLE items;--": 'x',
        embedding: 'leak',
        id: '1',
      },
    }))
    const r = await parseNLFilter('thai food')
    expect(r.structuredFilters).toEqual({ cuisine: 'Thai' })
    expect(Object.keys(r.structuredFilters)).not.toContain('embedding')
    expect(Object.keys(r.structuredFilters)).not.toContain('id')
  })

  it('drops structured filter values that are empty or non-string', async () => {
    mockAI(JSON.stringify({
      type: 'place',
      searchQuery: '',
      structuredFilters: { cuisine: '', city: 'Bangkok', country: null, priceRange: 42 },
    }))
    const r = await parseNLFilter('places in bangkok')
    expect(r.structuredFilters).toEqual({ city: 'Bangkok' })
  })

  // ── Type validation ──────────────────────────────────────────────────────────

  it('nullifies an unknown item type', async () => {
    mockAI(JSON.stringify({ type: 'banana', searchQuery: 'x', structuredFilters: {} }))
    const r = await parseNLFilter('something')
    expect(r.type).toBeNull()
  })

  it('accepts each valid item type', async () => {
    for (const t of ['note', 'recipe', 'media', 'book', 'place', 'link', 'stock', 'spec']) {
      vi.clearAllMocks()
      mockAI(JSON.stringify({ type: t, searchQuery: '', structuredFilters: {} }))
      const r = await parseNLFilter('q')
      expect(r.type).toBe(t)
    }
  })

  // ── Robustness / fallback ──────────────────────────────────────────────────────

  it('extracts JSON even when the model adds preamble', async () => {
    mockAI('Sure! Here you go:\n{"type":"book","searchQuery":"","structuredFilters":{"status":"reading"}}')
    const r = await parseNLFilter('books I am reading')
    expect(r.type).toBe('book')
    expect(r.structuredFilters).toEqual({ status: 'reading' })
  })

  it('falls back to a plain text search when the response is not JSON', async () => {
    mockAI('I cannot help with that.')
    const r = await parseNLFilter('weird query text')
    expect(r.type).toBeNull()
    expect(r.searchQuery).toBe('weird query text')
    expect(r.structuredFilters).toEqual({})
  })

  it('falls back when structuredFilters is missing entirely', async () => {
    mockAI(JSON.stringify({ type: 'note', searchQuery: 'meeting' }))
    const r = await parseNLFilter('meeting notes')
    expect(r.type).toBe('note')
    expect(r.structuredFilters).toEqual({})
  })

  it('handles a non-string searchQuery by defaulting to empty', async () => {
    mockAI(JSON.stringify({ type: 'note', searchQuery: 123, structuredFilters: {} }))
    const r = await parseNLFilter('q')
    expect(r.searchQuery).toBe('')
  })
})
