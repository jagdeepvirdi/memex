import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findSimilarItems } from './duplicateService'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

describe('findSimilarItems', () => {
  it('returns [] for an empty embedding without querying the DB', async () => {
    const r = await findSimilarItems([])
    expect(r).toEqual([])
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('returns matching rows for a valid embedding', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 'i1', title: 'Dup', type: 'note', similarity: 0.95 }],
    } as any)
    const r = await findSimilarItems([0.1, 0.2, 0.3])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('i1')
    expect(r[0].similarity).toBe(0.95)
  })

  it('passes the similarity threshold and limit to the query', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    await findSimilarItems([0.1, 0.2], 5)
    const params = vi.mocked(pool.query).mock.calls[0][1] as unknown[]
    expect(params).toContain(0.92) // SIMILARITY_THRESHOLD
    expect(params).toContain(5)    // limit
  })

  it('defaults to a limit of 3', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    await findSimilarItems([0.1])
    const params = vi.mocked(pool.query).mock.calls[0][1] as unknown[]
    expect(params).toContain(3)
  })

  it('never throws — returns [] on a DB error', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('vector ext missing'))
    const r = await findSimilarItems([0.1, 0.2, 0.3])
    expect(r).toEqual([])
  })

  it('only matches non-deleted items with embeddings', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    await findSimilarItems([0.1])
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string
    expect(sql).toMatch(/deleted_at IS NULL/i)
    expect(sql).toMatch(/embedding IS NOT NULL/i)
  })
})
