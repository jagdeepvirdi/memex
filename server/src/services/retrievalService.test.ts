import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./embedder', () => ({ embedQuery: vi.fn() }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { pool } from '../db/client'
import { embedQuery } from './embedder'
import { retrieveItems } from './retrievalService'

const ROW = {
  id: 's1', title: 'Bangkok trip', type: 'place', content: 'Thai Garden', structured: {}, source: 'keep',
  source_url: null, encrypted: false, reviewed: true, created_at: new Date(), updated_at: new Date(),
  categories: ['Travel'], tags: ['food'],
}
const lastCall = () => {
  const calls = vi.mocked(pool.query).mock.calls
  return { sql: String(calls[calls.length - 1][0]), params: calls[calls.length - 1][1] as unknown[] }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2])
  vi.mocked(pool.query).mockResolvedValue({ rows: [ROW] } as any)
})

describe('retrieveItems — semantic path', () => {
  it('ranks by the active model only and scores unembedded items 0 instead of NULL', async () => {
    const r = await retrieveItems({ query: 'thai food', limit: 5 })
    expect(r.semantic).toBe(true)
    expect(r.items).toHaveLength(1)
    const { sql, params } = lastCall()
    expect(sql).toMatch(/CASE WHEN i\.embedding IS NOT NULL AND i\.embedding_model = \$2/)
    expect(sql).toMatch(/COALESCE\(ts_rank_cd/)
    expect(params.slice(0, 3)).toEqual([JSON.stringify([0.1, 0.2]), 'ollama:nomic-embed-text', 'thai food'])
    expect(params[params.length - 1]).toBe(5)
  })

  it('lists items that have no vector (plain search) unless asked to require one', async () => {
    await retrieveItems({ query: 'q', limit: 5 })
    expect(lastCall().sql).not.toMatch(/WHERE i\.deleted_at IS NULL AND i\.embedding IS NOT NULL/)
    await retrieveItems({ query: 'q', limit: 5, requireVector: true })
    expect(lastCall().sql).toMatch(/WHERE i\.deleted_at IS NULL AND i\.embedding IS NOT NULL AND i\.embedding_model = \$2/)
  })

  it('applies type, category and tag filters with the right parameters', async () => {
    await retrieveItems({ query: 'q', limit: 3, type: 'recipe', category: 'Food', tag: ' Dinner ' })
    const { sql, params } = lastCall()
    expect(sql).toMatch(/i\.type = \$4/)
    expect(params.slice(3)).toEqual(['recipe', 'Food', 'dinner', 3])
  })
})

describe('retrieveItems — keyword fallback', () => {
  it('falls back to keywords when the query cannot be embedded, instead of failing', async () => {
    vi.mocked(embedQuery).mockRejectedValueOnce(new Error('embedding provider down'))
    const r = await retrieveItems({ query: 'thai food', limit: 5 })
    expect(r.semantic).toBe(false)
    expect(r.items).toHaveLength(1)
    expect(pool.query).toHaveBeenCalledTimes(1)
    const { sql, params } = lastCall()
    expect(sql).not.toMatch(/::vector/)
    expect(sql).toMatch(/@@ replace\(plainto_tsquery\('english', \$\d+\)::text, ' & ', ' \| '\)::tsquery/) // terms are OR-ed in keyword-only mode
    expect(params).toEqual(['thai food', 5]) // no vector and no model id are bound
  })

  it('falls back to keywords when Ask needs vectors and none match the active model', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any).mockResolvedValueOnce({ rows: [ROW] } as any)
    const r = await retrieveItems({ query: 'q', limit: 10, requireVector: true })
    expect(r.semantic).toBe(false)
    expect(r.items).toHaveLength(1)
    expect(pool.query).toHaveBeenCalledTimes(2)
  })

  it('does not run a second query for plain search when the semantic one is empty', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const r = await retrieveItems({ query: 'q', limit: 10 })
    expect(r).toEqual({ items: [], semantic: true })
    expect(pool.query).toHaveBeenCalledTimes(1)
  })
})
