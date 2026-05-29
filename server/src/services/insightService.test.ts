import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateInsights } from './insightService'

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

beforeEach(() => vi.clearAllMocks())

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
})
