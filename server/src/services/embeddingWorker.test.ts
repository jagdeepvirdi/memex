import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./embeddingService', () => ({ embedAndStoreItem: vi.fn() }))
const mockBlocked = vi.fn()
vi.mock('./embeddingStatus', () => ({ embeddingBlockedReason: (...a: unknown[]) => mockBlocked(...a) }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { pool } from '../db/client'
import { embedAndStoreItem } from './embeddingService'
import { startEmbeddingWorker, backoffMs, resetEmbeddingBackoff } from './embeddingWorker'

const TICK = 60_000
const rowsOf = (...ids: string[]) => ids.map(id => ({ id, title: id, content: 'x' }))
/** A database that honours the worker's `NOT (id = ANY($1))` exclusion, like the real one. */
function dbWith(rows: Array<{ id: string; title: string; content: string }>) {
  vi.mocked(pool.query).mockImplementation((async (_sql: string, params: unknown[]) => {
    const excluded = new Set((params?.[0] as string[] | undefined) ?? [])
    return { rows: rows.filter(r => !excluded.has(r.id)) }
  }) as never)
}
const selectCalls = () => vi.mocked(pool.query).mock.calls.filter(c => /FROM items/.test(String(c[0])))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetEmbeddingBackoff()
  mockBlocked.mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

describe('embedding retry worker', () => {
  it('never retries an item that was deliberately skipped, and never touches encrypted items', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any)
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(TICK)
    const sql = String(selectCalls()[0][0])
    expect(sql).toMatch(/embedding IS NULL AND embedding_skip IS NULL AND deleted_at IS NULL AND encrypted = false/)
  })

  it('embeds each pending item through the single writer', async () => {
    const rows = rowsOf('a', 'b')
    vi.mocked(pool.query).mockResolvedValue({ rows } as any)
    vi.mocked(embedAndStoreItem).mockResolvedValue('embedded')
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(TICK)
    expect(embedAndStoreItem).toHaveBeenCalledTimes(2)
    expect(embedAndStoreItem).toHaveBeenCalledWith(rows[0])
    expect(embedAndStoreItem).toHaveBeenCalledWith(rows[1])
  })

  it('waits quietly while the active model cannot be used, without querying or embedding', async () => {
    mockBlocked.mockResolvedValue('Strict Local Mode is on')
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(TICK * 3)
    expect(pool.query).not.toHaveBeenCalled()
    expect(embedAndStoreItem).not.toHaveBeenCalled()
  })
})

describe('embedding retry worker — back-off', () => {
  it('stops re-selecting an item that keeps failing, so it cannot starve the others', async () => {
    dbWith(rowsOf('bad'))
    vi.mocked(embedAndStoreItem).mockResolvedValue('failed')
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(TICK * 3)
    expect(selectCalls()[0][1]).toEqual([[]])      // first look: nothing is waiting yet
    expect(selectCalls()[2][1]).toEqual([['bad']]) // third look: it is inside its back-off window, so it is excluded
  })

  it('waits longer after each failure (1, 2, 4 ... minutes)', async () => {
    dbWith(rowsOf('bad'))
    vi.mocked(embedAndStoreItem).mockResolvedValue('failed')
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(TICK)       // tick 1: fails (attempts 1, wait 1 min)
    await vi.advanceTimersByTimeAsync(TICK)       // tick 2: the 1 min has just passed -> retried, fails (attempts 2, wait 2 min)
    expect(embedAndStoreItem).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(TICK)       // tick 3: still inside the 2 min wait -> skipped
    expect(embedAndStoreItem).toHaveBeenCalledTimes(2)
    expect(selectCalls()[2][1]).toEqual([['bad']])
    await vi.advanceTimersByTimeAsync(TICK)       // tick 4: 2 min passed -> retried
    expect(embedAndStoreItem).toHaveBeenCalledTimes(3)
  })

  it('forgets an item once it succeeds', async () => {
    dbWith(rowsOf('flaky'))
    vi.mocked(embedAndStoreItem).mockResolvedValueOnce('failed').mockResolvedValue('embedded')
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(TICK * 2)
    await vi.advanceTimersByTimeAsync(TICK)
    expect(selectCalls().at(-1)![1]).toEqual([[]])
  })

  it('treats a skipped item as settled, not as a failure', async () => {
    dbWith(rowsOf('private'))
    vi.mocked(embedAndStoreItem).mockResolvedValue('skipped')
    await startEmbeddingWorker()
    await vi.advanceTimersByTimeAsync(TICK * 2)
    expect(selectCalls()[1][1]).toEqual([[]])
  })
})

describe('backoffMs', () => {
  it('doubles from one minute and stops growing at an hour', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000, 3_600_000])
  })
  it('treats zero attempts like the first', () => {
    expect(backoffMs(0)).toBe(60_000)
  })
})
