import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

// Regression guard for the route-ordering bug class: literal GET routes
// (e.g. /digest) being shadowed by the parametric /:id route. If /digest is
// registered after /:id, Express matches /:id with id="digest" and the handler
// fails on the UUID lookup — these tests would then catch it.

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/digestService', () => ({
  // Distinctive shape only the real /digest handler can produce.
  generateDigest: vi.fn().mockResolvedValue({
    period: 'ROUTE-OK', recentItems: [], weekCount: 0, prevWeekCount: 0,
    onThisDay: null, connection: null,
  }),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
beforeEach(() => vi.clearAllMocks())

describe('items route ordering — literal routes resolve before /:id', () => {
  it('GET /api/items/digest hits the digest handler (not /:id)', async () => {
    const res = await request(app).get('/api/items/digest').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.period).toBe('ROUTE-OK') // proves digestService ran, not fetchItem
  })

  it('GET /api/items/reminders/due returns an array, not a UUID-parse error', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app).get('/api/items/reminders/due').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /api/items/export/obsidian returns a zip, not a UUID-parse error', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app).get('/api/items/export/obsidian').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/zip/i)
  })
})
