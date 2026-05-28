import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

vi.mock('../services/embedder', () => ({
  embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedItem:  vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
beforeEach(() => vi.clearAllMocks())

const ITEM_ROW = {
  id: 'i1', title: 'Dog Friendly Bangkok', type: 'link', content: 'Kanchanaburi',
  structured: {}, source: 'keep', source_url: null, encrypted: false, reviewed: true,
  created_at: new Date(), updated_at: new Date(), categories: [], tags: [],
}

// ── POST /api/search ──────────────────────────────────────────────────────────

describe('POST /api/search', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/search').send({ query: 'test' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when query is missing', async () => {
    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/query/i)
  })

  it('returns 400 when query is not a string', async () => {
    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({ query: 42 })
    expect(res.status).toBe(400)
  })

  it('calls embedQuery and returns ranked results', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ITEM_ROW] } as any)

    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({ query: 'dog friendly places' })

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].title).toBe('Dog Friendly Bangkok')
    expect(res.body.total).toBe(1)
  })

  it('returns empty results when nothing matches', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({ query: 'xyzzy irrelevant query' })

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(0)
    expect(res.body.total).toBe(0)
  })

  it('passes type filter to query without error', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({ query: 'recipe', type: 'recipe' })

    expect(res.status).toBe(200)
  })

  it('passes category filter to query without error', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({ query: 'food', category: 'Food' })

    expect(res.status).toBe(200)
  })

  it('passes tag filter to query without error', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({ query: 'travel', tag: 'bangkok' })

    expect(res.status).toBe(200)
  })

  it('respects custom limit', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app)
      .post('/api/search')
      .set('Authorization', AUTH)
      .send({ query: 'food', limit: 5 })

    expect(res.status).toBe(200)
    // Verify limit was passed into the query params
    const queryCall = vi.mocked(pool.query).mock.calls[0]
    expect(queryCall[1]).toContain(5)
  })
})

// ── GET /api/search/graph ─────────────────────────────────────────────────────

describe('GET /api/search/graph', () => {
  it('returns nodes and links', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'Note A', type: 'note' }] } as any)
      .mockResolvedValueOnce({ rows: [{ source: 'i1', target: 'i2', weight: 0.92 }] } as any)

    const res = await request(app)
      .get('/api/search/graph')
      .set('Authorization', AUTH)

    expect(res.status).toBe(200)
    expect(res.body.nodes).toHaveLength(1)
    expect(res.body.links).toHaveLength(1)
    expect(res.body.links[0].weight).toBeCloseTo(0.92)
  })

  it('returns empty nodes and links when no embeddings exist', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app)
      .get('/api/search/graph')
      .set('Authorization', AUTH)

    expect(res.status).toBe(200)
    expect(res.body.nodes).toHaveLength(0)
    expect(res.body.links).toHaveLength(0)
  })
})
