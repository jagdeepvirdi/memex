import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./embeddingService', () => ({ embedAndStoreItem: vi.fn() }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { pool } from '../db/client'
import { embedAndStoreItem } from './embeddingService'
import { startEmbeddingWorker } from './embeddingWorker'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('embedding retry worker', () => {
  it('never retries an item that was deliberately skipped (private under a cloud model)', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any)
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(60_000)
    const sql = String(vi.mocked(pool.query).mock.calls[0][0])
    expect(sql).toMatch(/embedding IS NULL AND embedding_skip IS NULL AND deleted_at IS NULL/)
  })

  it('embeds each pending item through the single writer', async () => {
    const rows = [
      { id: 'a', title: 'A', content: 'x' },
      { id: 'b', title: 'B', content: 'y' },
    ]
    vi.mocked(pool.query).mockResolvedValue({ rows } as any)
    vi.mocked(embedAndStoreItem).mockResolvedValue('embedded')
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(embedAndStoreItem).toHaveBeenCalledTimes(2)
    expect(embedAndStoreItem).toHaveBeenCalledWith(rows[0])
    expect(embedAndStoreItem).toHaveBeenCalledWith(rows[1])
  })
})
