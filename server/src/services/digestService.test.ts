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

// Queue the 5 queries generateDigest issues, in order:
// 1) recent items  2) week + priority counts  3) on-this-day  4) random reviewed (connection candidates)
// 5) this week's essential/useful items
function queue(
  client: any, recent: any[], thisWeek: number, prevWeek: number, onThisDay: any[], random: any[],
  extra: { counts?: Record<string, string>; priority?: any[] } = {},
) {
  client.query
    .mockResolvedValueOnce({ rows: recent })
    .mockResolvedValueOnce({ rows: [{ this_week: String(thisWeek), prev_week: String(prevWeek), ...extra.counts }] })
    .mockResolvedValueOnce({ rows: onThisDay })
    .mockResolvedValueOnce({ rows: random })
    .mockResolvedValueOnce({ rows: extra.priority ?? [] })
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

describe('generateDigest byPriority', () => {
  it('reports the weekly priority counts and groups essential / useful items', async () => {
    const client = await getClient()
    queue(client, [row({ id: 'r1' })], 6, 2, [], [], {
      counts: { essential: '2', useful: '1', skip: '1', untriaged: '2' },
      priority: [
        row({ id: 'e1', priority: 'essential' }), row({ id: 'u1', priority: 'useful' }), row({ id: 'e2', priority: 'essential' }),
      ],
    })
    const d = await generateDigest()
    expect(d.byPriority.counts).toEqual({ essential: 2, useful: 1, skip: 1, untriaged: 2 })
    expect(d.byPriority.essential.map(i => i.id)).toEqual(['e1', 'e2'])
    expect(d.byPriority.useful.map(i => i.id)).toEqual(['u1'])
  })

  it('keeps recentItems (the existing field) alongside it', async () => {
    const client = await getClient()
    queue(client, [row({ id: 'a' }), row({ id: 'b' })], 2, 0, [], [])
    const d = await generateDigest()
    expect(d.recentItems.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('returns zero counts and empty groups when nothing is triaged', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [])
    const d = await generateDigest()
    expect(d.byPriority).toEqual({ counts: { essential: 0, useful: 0, skip: 0, untriaged: 0 }, essential: [], useful: [] })
  })

  it('counts and ranks within the last 7 days, capped per priority, newest first', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [])
    await generateDigest()
    const calls = client.query.mock.calls.map((c: any[]) => String(c[0]))
    const counts = calls.find((q: string) => /priority = 'essential'/.test(q))!
    expect(counts).toMatch(/priority IS NULL/)
    const ranked = calls.find((q: string) => q.includes('ROW_NUMBER() OVER (PARTITION BY i.priority'))!
    expect(ranked).toMatch(/INTERVAL '7 days'/)
    expect(ranked).toMatch(/deleted_at IS NULL/)
    expect(ranked).toContain('rn <= $1')
    expect(client.query.mock.calls.find((c: any[]) => /ROW_NUMBER/.test(String(c[0])))![1]).toEqual([5])
  })

  it('loads intent and priority so cards and groups can use them', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [])
    await generateDigest()
    const first = String(client.query.mock.calls[0][0])
    expect(first).toContain('i.intent, i.priority')
  })
})

describe('generateDigest privacy guard', () => {
  const opts = () => vi.mocked(aiChat).mock.calls[0][5]

  it('marks the connection call cloud-safe for ordinary items', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [row({ id: 'a', type: 'recipe' }), row({ id: 'b', type: 'place' })])
    vi.mocked(aiChat).mockResolvedValueOnce('A link.')
    await generateDigest()
    expect(opts()).toEqual({ task: 'digest', cloudSafe: true })
  })

  it('pins the call to local models when either item is private', async () => {
    const client = await getClient()
    queue(client, [], 0, 0, [], [row({ id: 'a', type: 'recipe', categories: ['Personal', 'Contacts'] }), row({ id: 'b', type: 'place' })])
    vi.mocked(aiChat).mockResolvedValueOnce('A link.')
    await generateDigest()
    expect(opts()).toEqual({ task: 'digest', cloudSafe: false })
  })
})
