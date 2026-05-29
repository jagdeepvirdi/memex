import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRediscoveryItems } from './rediscoveryService'

vi.mock('../db/client', () => {
  const client = { query: vi.fn(), release: vi.fn() }
  return { pool: { connect: vi.fn().mockResolvedValue(client) } }
})
import { pool } from '../db/client'

async function getClient() { return (await vi.mocked(pool.connect)()) as any }

const row = (over: Record<string, unknown> = {}) => ({
  id: 'i1', title: 'Old note', type: 'note', content: 'c', structured: {},
  source: 'keep', source_url: null, encrypted: false, reviewed: true,
  created_at: new Date('2023-05-30'), updated_at: new Date('2023-05-30'),
  categories: [], tags: [], confidence: null, remind_at: null, public_token: null,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('getRediscoveryItems', () => {
  it('returns an on-this-day item with a year-based reason', async () => {
    const client = await getClient()
    client.query
      .mockResolvedValueOnce({ rows: [row({ created_at: new Date('2022-05-30') })] }) // on-this-day
      .mockResolvedValueOnce({ rows: [] })                                            // random
    const r = await getRediscoveryItems()
    const onThisDay = r.find(x => x.type === 'on-this-day')
    expect(onThisDay).toBeDefined()
    expect(onThisDay!.reason).toMatch(/year/i)
  })

  it('returns random rediscovery items when no on-this-day match', async () => {
    const client = await getClient()
    client.query
      .mockResolvedValueOnce({ rows: [] })                       // on-this-day: none
      .mockResolvedValueOnce({ rows: [row(), row({ id: 'i2' })] }) // random: two
    const r = await getRediscoveryItems()
    expect(r.length).toBeGreaterThanOrEqual(1)
    expect(r.every(x => x.type === 'random')).toBe(true)
  })

  it('returns [] when nothing qualifies', async () => {
    const client = await getClient()
    client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    expect(await getRediscoveryItems()).toEqual([])
  })

  it('always releases the client', async () => {
    const client = await getClient()
    client.query.mockResolvedValue({ rows: [] })
    await getRediscoveryItems()
    expect(client.release).toHaveBeenCalled()
  })
})
