import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { classify } from '../services/classifier'
import { aiChat } from '../services/ai'

// Capturing a note that names several places offers them as separate entries (the client sends the kept ones back).
// Invented names only.
vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/ai', async (orig) => ({ ...(await orig<typeof import('../services/ai')>()), aiChat: vi.fn(), aiEmbed: vi.fn().mockResolvedValue([]) }))
vi.mock('../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../services/classifier', () => ({ classify: vi.fn(), classifyBatch: vi.fn() }))
vi.mock('../services/duplicateService', async (orig) => ({
  ...(await orig<typeof import('../services/duplicateService')>()),
  findSimilarItems: vi.fn().mockResolvedValue([]),
  findItemsBySourceUrl: vi.fn().mockResolvedValue([]),
}))
vi.mock('../services/settings', async (orig) => ({
  ...(await orig<typeof import('../services/settings')>()),
  getSetting: vi.fn().mockResolvedValue(false),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const TRIP = 'Pine Valley trip ideas: Old Mill Cafe, Lakeview Hotel, Eagle Rock Viewpoint. Eat at Maple Diner.'
const TRAVEL = {
  type: 'place', title: 'Pine Valley', categories: ['Travel', 'Destinations'], tags: ['travel'], summary: 'Ideas', structured: { name: 'Pine Valley', type: 'destination' },
  confidence: 90, intent: 'actionable',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never) // no places in the library yet
})

describe('POST /api/ingest/text: places inside the note', () => {
  it('offers each named place as its own entry', async () => {
    vi.mocked(classify).mockResolvedValue(TRAVEL as never)
    vi.mocked(aiChat).mockResolvedValue(JSON.stringify({ places: [
      { name: 'Old Mill Cafe', type: 'cafe', confidence: 90 },
      { name: 'Lakeview Hotel', type: 'hotel', confidence: 88 },
      { name: 'Eagle Rock Viewpoint', type: 'attraction', confidence: 85 },
      { name: 'Maple Diner', type: 'restaurant', confidence: 90 },
    ] }))
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: TRIP })
    expect(res.status).toBe(200)
    expect(res.body.preview.places.map((p: { name: string }) => p.name)).toEqual(['Old Mill Cafe', 'Lakeview Hotel', 'Eagle Rock Viewpoint', 'Maple Diner'])
    expect(res.body.preview.places[1]).toMatchObject({ type: 'hotel', confidence: 88 })
  })

  it('leaves out the destination the note is already saved as, and places already in the library', async () => {
    vi.mocked(classify).mockResolvedValue(TRAVEL as never)
    vi.mocked(aiChat).mockResolvedValue(JSON.stringify({ places: [
      { name: 'Pine Valley', type: 'destination', confidence: 95 },
      { name: 'Maple Diner', type: 'restaurant', confidence: 90 },
      { name: 'Old Mill Cafe', type: 'cafe', confidence: 90 },
    ] }))
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'p1', name: 'Old Mill Cafe', title: 'Old Mill Cafe', city: null }] } as never)
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: TRIP })
    expect(res.body.preview.places.map((p: { name: string }) => p.name)).toEqual(['Maple Diner'])
  })

  it('has no places key, and makes no extra AI call, for a note that is not about places', async () => {
    vi.mocked(classify).mockResolvedValue({ type: 'note', title: 'Shopping', categories: ['Food'], tags: [], summary: '', structured: {}, confidence: 90 } as never)
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'Buy milk and eggs' })
    expect(res.status).toBe(200)
    expect(res.body.preview).not.toHaveProperty('places')
    expect(aiChat).not.toHaveBeenCalled()
  })

  it('still returns the preview when the place lookup fails', async () => {
    vi.mocked(classify).mockResolvedValue(TRAVEL as never)
    vi.mocked(aiChat).mockRejectedValue(new Error('provider down'))
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: TRIP })
    expect(res.status).toBe(200)
    expect(res.body.preview.title).toBe('Pine Valley')
    expect(res.body.preview).not.toHaveProperty('places')
  })

  it('keeps a private note on this machine: the place call is told not to use a cloud model', async () => {
    vi.mocked(classify).mockResolvedValue({ ...TRAVEL, tags: ['private'] } as never)
    vi.mocked(aiChat).mockResolvedValue('{"places":[]}')
    await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: TRIP })
    expect(vi.mocked(aiChat).mock.calls[0][5]).toMatchObject({ task: 'place_mining', cloudSafe: false })
  })
})
