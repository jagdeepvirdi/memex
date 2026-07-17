import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

vi.mock('./classifier.js', () => ({
  classify: vi.fn().mockResolvedValue({
    type: 'note', title: 'AI Title', categories: [], tags: [],
    summary: 'A summary', structured: {}, confidence: 80, model: 'llama3.2',
  }),
}))

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { pool } from '../db/client.js'
import { reprocessBulkItems } from './itemService.js'

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }

// Lets the fire-and-forget background IIFE in reprocessBulkItems() run to
// completion before assertions — the function itself returns as soon as the
// job is queued, well before the notify call fires.
const flush = () => new Promise(r => setImmediate(r))

describe('reprocessBulkItems — DevBrain notification', () => {
  const originalUrl = process.env.DEVBRAIN_NOTIFY_URL
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.DEVBRAIN_NOTIFY_URL
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    mockPool.connect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ reviewed: false }] }),
      release: vi.fn(),
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.DEVBRAIN_NOTIFY_URL
    else process.env.DEVBRAIN_NOTIFY_URL = originalUrl
  })

  it('does not call fetch when DEVBRAIN_NOTIFY_URL is unset', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'T', content: 'C' }] }) // SELECT candidates
      .mockResolvedValue({ rows: [] }) // job insert/progress updates

    await reprocessBulkItems(true)
    await flush()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('POSTs a success notification with project/title/body/level when all items succeed', async () => {
    process.env.DEVBRAIN_NOTIFY_URL = 'http://localhost:3001/api/notify'
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'T', content: 'C' }] })
      .mockResolvedValue({ rows: [] })

    await reprocessBulkItems(true)
    await flush()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/notify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body).toEqual({
      project: 'memex',
      title: 'Memex re-index complete',
      body: '1 of 1 item(s) reprocessed.',
      level: 'success',
    })
  })

  it('POSTs a warning-level notification when some items fail', async () => {
    process.env.DEVBRAIN_NOTIFY_URL = 'http://localhost:3001/api/notify'
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'T', content: 'C' }] }) // SELECT candidates
      .mockResolvedValueOnce({ rows: [] }) // job insert
      .mockRejectedValueOnce(new Error('progress update failed')) // triggers the catch(() => {}) — irrelevant to failed count
      .mockResolvedValue({ rows: [] })
    mockPool.connect.mockResolvedValue({
      query: vi.fn().mockRejectedValue(new Error('DB update failed')), // forces this item into the failed bucket
      release: vi.fn(),
    })

    await reprocessBulkItems(true)
    await flush()

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.level).toBe('warning')
    expect(body.title).toBe('Memex re-index finished with failures')
    expect(body.body).toBe('0 of 1 item(s) reprocessed, 1 failed.')
  })

  it('does not throw when the notify fetch call itself rejects', async () => {
    process.env.DEVBRAIN_NOTIFY_URL = 'http://localhost:3001/api/notify'
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'T', content: 'C' }] })
      .mockResolvedValue({ rows: [] })

    await expect(reprocessBulkItems(true)).resolves.toEqual({ queued: 1, jobId: expect.any(String) })
    await flush() // background failure must not produce an unhandled rejection
  })
})
