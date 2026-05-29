import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateDigest } from './digestService'

vi.mock('../db/client', () => {
  const client = { query: vi.fn(), release: vi.fn() }
  return { pool: { connect: vi.fn().mockResolvedValue(client) } }
})
vi.mock('./ai', () => ({ aiChat: vi.fn() }))

import { pool } from '../db/client'
import { aiChat } from './ai'

async function getClient() { return (await vi.mocked(pool.connect)()) as any }

const row = (over: Record<string, unknown> = {}) => ({
  id: 'i1', title: 'Item', type: 'note', content: 'content', structured: { summary: 's' },
  source: 'keep', source_url: null, encrypted: false, reviewed: true,
  created_at: new Date(), updated_at: new Date(),
  categories: [], tags: [], confidence: null, remind_at: null, public_token: null,
  ...over,
})

// Queue the 4 queries generateDigest issues, in order:
// 1) recent items  2) week counts  3) on-this-day  4) random reviewed (connection candidates)
function queue(client: any, recent: any[], thisWeek: number, prevWeek: number, onThisDay: any[], random: any[]) {
  client.query
    .mockResolvedValueOnce({ rows: recent })
    .mockResolvedValueOnce({ rows: [{ this_week: String(thisWeek), prev_week: String(prevWeek) }] })
    .mockResolvedValueOnce({ rows: onThisDay })
    .mockResolvedValueOnce({ rows: random })
}

beforeEach(() => vi.clearAllMocks())

describe('generateDigest', () => {
  it('returns week counts and a formatted period', async () => {
    const client = await getClient()
    queue(client, [row()], 7, 3, [], [])
    const d = await generateDigest()
    expect(d.weekCount).toBe(7)
    expect(d.prevWeekCount).toBe(3)
    expect(d.recentItems).toHaveLength(1)
    expect(d.period).toMatch(/\d{4}/) // includes the year
  })

  it('builds an AI connection when ≥2 reviewed candidates exist', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [row({ id: 'a', type: 'recipe' }), row({ id: 'b', type: 'place' })])
    vi.mocked(aiChat).mockResolvedValueOnce('Both reflect a love of Thai cooking.')
    const d = await generateDigest()
    expect(d.connection).not.toBeNull()
    expect(d.connection!.insight).toMatch(/Thai/)
    expect(aiChat).toHaveBeenCalled()
  })

  it('leaves connection null when fewer than 2 candidates', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [row()])
    const d = await generateDigest()
    expect(d.connection).toBeNull()
    expect(aiChat).not.toHaveBeenCalled()
  })

  it('degrades gracefully (connection null) if the AI call fails', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [row({ id: 'a' }), row({ id: 'b' })])
    vi.mocked(aiChat).mockRejectedValueOnce(new Error('ollama down'))
    const d = await generateDigest()
    expect(d.connection).toBeNull()
  })

  it('surfaces an on-this-day memory when present', async () => {
    const client = await getClient()
    queue(client, [], 1, 0, [row({ created_at: new Date('2022-01-01') })], [])
    const d = await generateDigest()
    expect(d.onThisDay).not.toBeNull()
    expect(d.onThisDay!.type).toBe('on-this-day')
  })

  it('always releases the client', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [])
    await generateDigest()
    expect(client.release).toHaveBeenCalled()
  })
})
