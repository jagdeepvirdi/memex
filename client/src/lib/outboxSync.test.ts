import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()), // the real ApiError and SessionExpiredError
  ingestUrl: vi.fn(),
  apiFetch: vi.fn(),
  createItem: vi.fn(),
  pingServer: vi.fn(),
}))

import { ApiError, SessionExpiredError, apiFetch, createItem, ingestUrl, pingServer } from './api'
import { MAX_ATTEMPTS, autoRetryDelay, describeFlush, flushOutbox, sendOutboxItem } from './outboxSync'
import { addToOutbox, listOutbox, type OutboxItem } from './outbox'

const preview = (over: Record<string, unknown> = {}) => ({
  title: 'Pine Valley guide', type: 'note', content: 'page text', structured: {}, categories: ['Travel'], tags: [],
  source: 'url', sourceUrl: 'https://example.com/a', confidence: 90, reviewed: false, ...over,
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.clearAllMocks()
  vi.mocked(pingServer).mockResolvedValue(true)
  vi.mocked(ingestUrl).mockResolvedValue({ preview: preview(), similarItems: [] } as never)
  vi.mocked(apiFetch).mockResolvedValue({ preview: preview({ source: 'manual', content: 'server text' }), similarItems: [] } as never)
  vi.mocked(createItem).mockResolvedValue({ id: 'new-1', title: 'Pine Valley guide' } as never)
})

const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({ id: 'i1', kind: 'url', value: 'https://example.com/a', createdAt: 1, status: 'waiting', attempts: 0, ...over })

describe('sendOutboxItem', () => {
  it('reads a link and saves it the way the capture screen does, as an unreviewed item', async () => {
    const outcome = await sendOutboxItem(item())
    expect(ingestUrl).toHaveBeenCalledWith('https://example.com/a')
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pine Valley guide', reviewed: false, source: 'url' }))
    expect(outcome).toEqual({ kind: 'sent', title: 'Pine Valley guide', places: 0 })
  })

  it('sends the places found in the page along with it', async () => {
    const places = [{ name: 'Old Mill Cafe', type: 'cafe', confidence: 90 }, { name: 'Lakeview Hotel', type: 'hotel', confidence: 88 }]
    vi.mocked(ingestUrl).mockResolvedValue({ preview: preview({ places, placesModel: 'gemini:x' }), similarItems: [] } as never)
    const outcome = await sendOutboxItem(item())
    expect(vi.mocked(createItem).mock.calls[0][0]).toMatchObject({ places, placesModel: 'gemini:x' })
    expect(outcome).toMatchObject({ kind: 'sent', places: 2 })
  })

  it('classifies a note and saves it with the text it was written with', async () => {
    const outcome = await sendOutboxItem(item({ kind: 'text', value: 'Stay at Lakeview Hotel' }))
    expect(apiFetch).toHaveBeenCalledWith('/ingest/text', { method: 'POST', body: JSON.stringify({ text: 'Stay at Lakeview Hotel' }) })
    expect(vi.mocked(createItem).mock.calls[0][0]).toMatchObject({ content: 'Stay at Lakeview Hotel' })
    expect(outcome.kind).toBe('sent')
  })

  it('does not save again something Memex already has (an exact match)', async () => {
    vi.mocked(ingestUrl).mockResolvedValue({ preview: preview(), similarItems: [{ id: 'old', title: 'Saved before', type: 'link', similarity: 1 }] } as never)
    expect(await sendOutboxItem(item())).toEqual({ kind: 'duplicate', title: 'Saved before' })
    expect(createItem).not.toHaveBeenCalled()
  })

  it('still saves when the only matches are merely similar', async () => {
    vi.mocked(ingestUrl).mockResolvedValue({ preview: preview(), similarItems: [{ id: 'x', title: 'Related', type: 'link', similarity: 0.95 }] } as never)
    expect((await sendOutboxItem(item())).kind).toBe('sent')
  })

  it('maps each way it can go wrong to an outcome', async () => {
    vi.mocked(ingestUrl).mockRejectedValueOnce(new SessionExpiredError())
    expect((await sendOutboxItem(item())).kind).toBe('auth')
    vi.mocked(ingestUrl).mockRejectedValueOnce(new ApiError('Too many ingest requests. Slow down.', 429))
    expect((await sendOutboxItem(item())).kind).toBe('busy')
    vi.mocked(ingestUrl).mockRejectedValueOnce(new ApiError('Bad gateway', 502))
    expect((await sendOutboxItem(item())).kind).toBe('unreachable')
    vi.mocked(ingestUrl).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect((await sendOutboxItem(item())).kind).toBe('unreachable')
    vi.mocked(ingestUrl).mockRejectedValueOnce(new ApiError('Failed to ingest URL', 500))
    expect(await sendOutboxItem(item())).toEqual({ kind: 'failed', message: 'Failed to ingest URL', retryable: true })
    vi.mocked(ingestUrl).mockRejectedValueOnce(new ApiError('URL is required', 400))
    expect(await sendOutboxItem(item())).toEqual({ kind: 'failed', message: 'URL is required', retryable: false })
  })

  it('treats a failure while saving (after reading) the same way', async () => {
    vi.mocked(createItem).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect((await sendOutboxItem(item())).kind).toBe('unreachable')
  })
})

describe('flushOutbox', () => {
  it('sends everything waiting, oldest first, and empties the outbox', async () => {
    await addToOutbox('url', 'https://example.com/a')
    await addToOutbox('text', 'a note')
    const summary = await flushOutbox()
    expect(summary).toMatchObject({ sent: 2, duplicates: 0, failed: 0, remaining: 0 })
    expect(summary.stoppedBecause).toBeUndefined()
    expect(await listOutbox()).toEqual([])
    expect(vi.mocked(createItem).mock.calls).toHaveLength(2)
  })

  it('does nothing, and keeps everything, when the laptop cannot be reached', async () => {
    await addToOutbox('url', 'https://example.com/a')
    await addToOutbox('text', 'a note')
    vi.mocked(pingServer).mockResolvedValue(false)
    const summary = await flushOutbox()
    expect(summary).toMatchObject({ stoppedBecause: 'unreachable', remaining: 2, sent: 0 })
    expect(ingestUrl).not.toHaveBeenCalled()
    expect(await listOutbox()).toHaveLength(2)
  })

  it('stops when the connection drops part-way and leaves the rest exactly as they were', async () => {
    await addToOutbox('url', 'https://example.com/1')
    await addToOutbox('url', 'https://example.com/2')
    await addToOutbox('url', 'https://example.com/3')
    vi.mocked(ingestUrl)
      .mockResolvedValueOnce({ preview: preview(), similarItems: [] } as never)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const summary = await flushOutbox()
    expect(summary).toMatchObject({ sent: 1, stoppedBecause: 'unreachable', remaining: 2 })
    const left = await listOutbox()
    expect(left.map((i) => i.value)).toEqual(['https://example.com/2', 'https://example.com/3'])
    expect(left.every((i) => i.status === 'waiting' && i.attempts === 0)).toBe(true)
  })

  it('keeps everything and asks to sign in again when the session has ended', async () => {
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(ingestUrl).mockRejectedValue(new SessionExpiredError())
    expect(await flushOutbox()).toMatchObject({ stoppedBecause: 'auth', remaining: 1 })
    expect(await listOutbox()).toHaveLength(1)
  })

  it('stops when the server says it is busy', async () => {
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(ingestUrl).mockRejectedValue(new ApiError('Too many ingest requests. Slow down.', 429))
    expect(await flushOutbox()).toMatchObject({ stoppedBecause: 'busy', remaining: 1 })
  })

  it('counts an already-saved item as done and removes it', async () => {
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(ingestUrl).mockResolvedValue({ preview: preview(), similarItems: [{ id: 'old', title: 'Saved before', type: 'link', similarity: 1 }] } as never)
    expect(await flushOutbox()).toMatchObject({ sent: 0, duplicates: 1, remaining: 0 })
    expect(await listOutbox()).toEqual([])
  })

  it('retries a server error a few times, then marks the item failed with the reason and moves on', async () => {
    await addToOutbox('url', 'https://example.com/bad')
    await addToOutbox('url', 'https://example.com/good')
    vi.mocked(ingestUrl).mockImplementation(async (url: string) => {
      if (url.endsWith('/bad')) throw new ApiError('Failed to ingest URL', 500)
      return { preview: preview(), similarItems: [] } as never
    })

    for (let run = 1; run < MAX_ATTEMPTS; run++) {
      const s = await flushOutbox()
      expect(s.failed).toBe(0)
      const bad = (await listOutbox()).find((i) => i.value.endsWith('/bad'))!
      expect(bad).toMatchObject({ status: 'waiting', attempts: run, lastError: 'Failed to ingest URL' })
    }
    const last = await flushOutbox()
    expect(last.failed).toBe(1)
    const rest = await listOutbox()
    expect(rest).toHaveLength(1)
    expect(rest[0]).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS, lastError: 'Failed to ingest URL' })
  })

  it('marks a request the server rejects (4xx) failed at once, without retrying', async () => {
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(ingestUrl).mockRejectedValue(new ApiError('Unsupported link', 422))
    expect(await flushOutbox()).toMatchObject({ failed: 1, remaining: 0 })
    expect((await listOutbox())[0]).toMatchObject({ status: 'failed', attempts: 1, lastError: 'Unsupported link' })
  })

  it('does not send items already marked failed', async () => {
    const a = await addToOutbox('url', 'https://example.com/a')
    const { updateOutboxItem } = await import('./outbox')
    await updateOutboxItem(a.id, { status: 'failed', lastError: 'x' })
    expect(await flushOutbox()).toMatchObject({ sent: 0, remaining: 0 })
    expect(ingestUrl).not.toHaveBeenCalled()
  })

  it('does nothing and does not even contact the server when the outbox is empty', async () => {
    expect(await flushOutbox()).toMatchObject({ sent: 0, remaining: 0 })
    expect(pingServer).not.toHaveBeenCalled()
  })
})

describe('describeFlush', () => {
  const base = { sent: 0, duplicates: 0, failed: 0, places: 0, remaining: 0 }
  it('says what happened in one sentence', () => {
    expect(describeFlush({ ...base, sent: 3, places: 2 })).toBe('3 saved (plus 2 places)')
    expect(describeFlush({ ...base, sent: 1, places: 1, duplicates: 2 })).toBe('1 saved (plus 1 place), 2 already in Memex')
    expect(describeFlush({ ...base, failed: 1 })).toBe('1 could not be saved')
    expect(describeFlush(base)).toBe('Nothing was waiting.')
  })
  it('explains why it stopped, and how many are still waiting', () => {
    expect(describeFlush({ ...base, stoppedBecause: 'unreachable', remaining: 4 })).toMatch(/not reachable.*4 still waiting/)
    expect(describeFlush({ ...base, sent: 1, stoppedBecause: 'auth', remaining: 2 })).toMatch(/1 saved\. Sign in again.*2 still waiting/)
    expect(describeFlush({ ...base, stoppedBecause: 'busy', remaining: 2 })).toMatch(/busy.*2 still waiting/)
  })
})

describe('autoRetryDelay', () => {
  it('asks less and less often while Memex stays unreachable, up to a ceiling', () => {
    const delays = [0, 1, 2, 3, 4, 5, 50].map(autoRetryDelay)
    expect(delays).toEqual([30_000, 60_000, 120_000, 300_000, 600_000, 600_000, 600_000])
    expect(autoRetryDelay(-3)).toBe(30_000)
  })
})
