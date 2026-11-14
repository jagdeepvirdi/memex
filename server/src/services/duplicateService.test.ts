import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findSimilarItems, findItemsBySourceUrl, mergeSimilar } from './duplicateService'
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

describe('findItemsBySourceUrl', () => {
  const row = (id: string, source_url: string) => ({ id, title: `T${id}`, type: 'link', source_url })

  it('matches the same YouTube video saved under a different URL form', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [row('a', 'https://youtu.be/dQw4w9WgXcQ?si=zzz'), row('b', 'https://www.youtube.com/watch?v=AAAAAAAAAAA')],
    } as any)
    const r = await findItemsBySourceUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')
    expect(r).toEqual([{ id: 'a', title: 'Ta', type: 'link', similarity: 1 }])
  })

  it('narrows candidates by the video id, with LIKE wildcards escaped', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    await findItemsBySourceUrl('https://youtu.be/dQw4w9WgXcQ')
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(['%dQw4w9WgXcQ%'])

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    await findItemsBySourceUrl('https://example.com/100%_off')
    expect(vi.mocked(pool.query).mock.calls[1][1]).toEqual(['%example.com/100\\%\\_off%'])
  })

  it('filters out LIKE false positives (same prefix, different page)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [row('a', 'https://example.com/post-2'), row('b', 'https://www.example.com/post/?utm_source=x')],
    } as any)
    const r = await findItemsBySourceUrl('https://example.com/post')
    expect(r.map((i) => i.id)).toEqual(['b'])
  })

  it('only looks at live items and respects the limit', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [row('a', 'https://example.com/p'), row('b', 'https://example.com/p/'), row('c', 'http://example.com/p')],
    } as any)
    const r = await findItemsBySourceUrl('https://example.com/p', 2)
    expect(r).toHaveLength(2)
    expect(vi.mocked(pool.query).mock.calls[0][0]).toMatch(/deleted_at IS NULL/i)
  })

  it('returns [] without querying for an unparseable URL', async () => {
    expect(await findItemsBySourceUrl('not a url')).toEqual([])
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('never throws — returns [] on a DB error', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'))
    expect(await findItemsBySourceUrl('https://example.com/p')).toEqual([])
  })
})

describe('mergeSimilar', () => {
  const s = (id: string, similarity: number) => ({ id, title: id, type: 'note' as const, similarity })

  it('keeps list order (URL matches first) and drops repeated ids', () => {
    expect(mergeSimilar([s('a', 1)], [s('b', 0.95), s('a', 0.97)]).map((i) => [i.id, i.similarity])).toEqual([['a', 1], ['b', 0.95]])
  })
})
