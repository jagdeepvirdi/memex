import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateInsights, resetInsightsCache } from './insightService'

vi.mock('../db/client', () => {
  const client = { query: vi.fn(), release: vi.fn() }
  return { pool: { connect: vi.fn().mockResolvedValue(client), query: vi.fn() }, __client: client }
})
vi.mock('./ai', () => ({ aiChat: vi.fn() }))

import { pool } from '../db/client'
import { aiChat } from './ai'

async function getClient() {
  return (await vi.mocked(pool.connect)()) as any
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useRealTimers()
  resetInsightsCache()
  // clearAllMocks keeps implementations; reset the ones tests set persistently.
  vi.mocked(aiChat).mockReset()
  ;(await getClient()).query.mockReset()
})

const sixRows = () => ({
  rows: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, type: 'note', summary: 's' })),
})
const oneInsight = JSON.stringify([
  { id: '1', title: 'Trip soon', description: 'Flight Friday', type: 'event', priority: 5 },
])

describe('generateInsights', () => {
  it('returns [] when there are fewer than 5 items (not enough signal)', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce({ rows: [{ title: 'a', type: 'note' }] })
    const r = await generateInsights()
    expect(r).toEqual([])
    expect(aiChat).not.toHaveBeenCalled()
  })

  it('parses a JSON array of insights from the model', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce({
      rows: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, type: 'note', summary: 's' })),
    })
    vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify([
      { id: '1', title: 'Trip soon', description: 'Flight Friday', type: 'event', priority: 5 },
      { id: '2', title: 'Sourdough phase', description: '3 recipes', type: 'habit', priority: 3 },
    ]))
    const r = await generateInsights()
    expect(r).toHaveLength(2)
    expect(r[0].type).toBe('event')
  })

  it('caps the result at 3 insights', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce({
      rows: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, type: 'note', summary: 's' })),
    })
    vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify(
      Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: `i${i}`, description: 'd', type: 'suggestion', priority: 1 })),
    ))
    const r = await generateInsights()
    expect(r).toHaveLength(3)
  })

  it('extracts the array even with surrounding prose', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce({
      rows: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, type: 'note', summary: 's' })),
    })
    vi.mocked(aiChat).mockResolvedValueOnce('Here are insights: [{"id":"1","title":"x","description":"y","type":"event","priority":2}] done')
    const r = await generateInsights()
    expect(r).toHaveLength(1)
  })

  it('returns [] on unparseable model output (never throws)', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce({
      rows: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, type: 'note', summary: 's' })),
    })
    vi.mocked(aiChat).mockResolvedValueOnce('no json here')
    const r = await generateInsights()
    expect(r).toEqual([])
  })

  it('releases the client even when the query throws', async () => {
    const client = await getClient()
    client.query.mockRejectedValueOnce(new Error('db error'))
    await expect(generateInsights()).rejects.toThrow()
    expect(client.release).toHaveBeenCalled()
  })

  it('releases the DB client before the slow model call starts', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce(sixRows())
    let releasedWhenModelCalled = false
    vi.mocked(aiChat).mockImplementationOnce(async () => {
      releasedWhenModelCalled = client.release.mock.calls.length > 0
      return oneInsight
    })
    await generateInsights()
    expect(releasedWhenModelCalled).toBe(true)
  })

  it('drops model items that are not insight objects', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce(sixRows())
    vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify([
      'Conversation about trips',
      { id: '1', title: 'Real one', description: 'ok', type: 'habit', priority: 2 },
      { id: '2', title: 'No description' },
      null,
    ]))
    const r = await generateInsights()
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Real one')
  })

  describe('caching', () => {
    it('serves a good result from cache without querying the DB or model again', async () => {
      const client = await getClient()
      client.query.mockResolvedValueOnce(sixRows())
      vi.mocked(aiChat).mockResolvedValueOnce(oneInsight)

      const first = await generateInsights()
      const second = await generateInsights()

      expect(second).toEqual(first)
      expect(aiChat).toHaveBeenCalledTimes(1)
      expect(client.query).toHaveBeenCalledTimes(1)
    })

    it('regenerates after the one-hour TTL expires', async () => {
      vi.useFakeTimers()
      const client = await getClient()
      client.query.mockResolvedValue(sixRows())
      vi.mocked(aiChat).mockResolvedValue(oneInsight)

      await generateInsights()
      await vi.advanceTimersByTimeAsync(59 * 60 * 1000)
      await generateInsights()
      expect(aiChat).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
      await generateInsights()
      expect(aiChat).toHaveBeenCalledTimes(2)
    })

    it('shares one model call between concurrent callers', async () => {
      const client = await getClient()
      client.query.mockResolvedValue(sixRows())
      let resolveModel!: (v: string) => void
      vi.mocked(aiChat).mockImplementationOnce(() => new Promise<string>(res => { resolveModel = res }))

      const a = generateInsights()
      const b = generateInsights()
      await vi.waitFor(() => expect(aiChat).toHaveBeenCalledTimes(1))
      resolveModel(oneInsight)

      const [ra, rb] = await Promise.all([a, b])
      expect(ra).toEqual(rb)
      expect(aiChat).toHaveBeenCalledTimes(1)
    })

    it('does not cache fewer-than-5-items results', async () => {
      const client = await getClient()
      client.query.mockResolvedValue({ rows: [{ title: 'a', type: 'note' }] })
      await generateInsights()
      await generateInsights()
      expect(client.query).toHaveBeenCalledTimes(2)
    })

    it('does not cache DB errors (next call retries)', async () => {
      const client = await getClient()
      client.query.mockRejectedValueOnce(new Error('db error')).mockResolvedValueOnce(sixRows())
      vi.mocked(aiChat).mockResolvedValueOnce(oneInsight)
      await expect(generateInsights()).rejects.toThrow()
      const r = await generateInsights()
      expect(r).toHaveLength(1)
    })

    it('backs off briefly after bad model output instead of re-calling the model', async () => {
      vi.useFakeTimers()
      const client = await getClient()
      client.query.mockResolvedValue(sixRows())
      vi.mocked(aiChat).mockResolvedValueOnce('no json here').mockResolvedValueOnce(oneInsight)

      expect(await generateInsights()).toEqual([])
      expect(await generateInsights()).toEqual([])          // inside the 2-minute back-off
      expect(aiChat).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(3 * 60 * 1000)      // back-off elapsed
      expect(await generateInsights()).toHaveLength(1)
      expect(aiChat).toHaveBeenCalledTimes(2)
    })
  })

  describe('timeout', () => {
    it('aborts the model request after 30s and returns []', async () => {
      vi.useFakeTimers()
      const client = await getClient()
      client.query.mockResolvedValueOnce(sixRows())
      let seenSignal: AbortSignal | undefined
      vi.mocked(aiChat).mockImplementationOnce((_p, _s, _f, _o, signal) => {
        seenSignal = signal
        return new Promise<string>((_, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      })

      const pending = generateInsights()
      await vi.advanceTimersByTimeAsync(29_000)
      expect(seenSignal?.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(2_000)
      expect(seenSignal?.aborted).toBe(true)
      expect(await pending).toEqual([])
    })
  })
})
