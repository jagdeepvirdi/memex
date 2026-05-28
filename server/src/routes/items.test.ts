import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

vi.mock('../services/classifier', () => ({
  classify: vi.fn().mockResolvedValue({
    type: 'note', title: 'AI Title', categories: ['Personal'],
    tags: ['test'], summary: 'A summary', structured: {},
  }),
  mapToCategories: vi.fn().mockReturnValue([]),
}))

vi.mock('../services/embedder', () => ({
  embedItem: vi.fn().mockResolvedValue([0.1, 0.2]),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

// Signed with the actual JWT_SECRET after dotenv loads (may differ from default)
let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const ITEM_ROW = {
  id: 'item-1', title: 'Test Note', type: 'note', content: 'Hello',
  structured: {}, source: 'manual', source_url: null,
  encrypted: false, reviewed: false,
  created_at: new Date('2024-01-01'), updated_at: new Date('2024-01-01'),
  categories: [], tags: [],
}

function mockClient(queries: Array<{ rows: unknown[] } | null>) {
  let i = 0
  const client = {
    query: vi.fn().mockImplementation(() =>
      Promise.resolve(queries[i++] ?? { rows: [] })
    ),
    release: vi.fn(),
  }
  vi.mocked(pool.connect).mockResolvedValue(client as any)
  return client
}

beforeEach(() => vi.clearAllMocks())

// ── GET /api/items ────────────────────────────────────────────────────────────

describe('GET /api/items', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/items')
    expect(res.status).toBe(401)
  })

  it('returns 200 with items array and total', async () => {
    mockClient([
      { rows: [{ total: '2' }] },
      { rows: [ITEM_ROW, ITEM_ROW] },
    ])
    const res = await request(app).get('/api/items').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(2)
    expect(res.body.total).toBe(2)
  })

  it('accepts type filter without error', async () => {
    mockClient([{ rows: [{ total: '0' }] }, { rows: [] }])
    const res = await request(app)
      .get('/api/items?type=recipe')
      .set('Authorization', AUTH)
    expect(res.status).toBe(200)
  })

  it('accepts pendingEnrichment=true filter', async () => {
    mockClient([{ rows: [{ total: '5' }] }, { rows: [ITEM_ROW] }])
    const res = await request(app)
      .get('/api/items?pendingEnrichment=true')
      .set('Authorization', AUTH)
    expect(res.status).toBe(200)
  })

  it('accepts enriched=true filter', async () => {
    mockClient([{ rows: [{ total: '1' }] }, { rows: [ITEM_ROW] }])
    const res = await request(app)
      .get('/api/items?enriched=true')
      .set('Authorization', AUTH)
    expect(res.status).toBe(200)
  })
})

// ── GET /api/items/stats ──────────────────────────────────────────────────────

describe('GET /api/items/stats', () => {
  it('returns totalItems, aiEnriched, pendingAI, recentActivity, totalVaultItems', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ total: '10', ai_enriched: '7', pending_ai: '3', recent: '2' }] } as any)
      .mockResolvedValueOnce({ rows: [{ type: 'note', count: '7' }, { type: 'recipe', count: '3' }] } as any)
      .mockResolvedValueOnce({ rows: [{ count: '4' }] } as any)

    const res = await request(app).get('/api/items/stats').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.totalItems).toBe(10)
    expect(res.body.aiEnriched).toBe(7)
    expect(res.body.pendingAI).toBe(3)
    expect(res.body.totalVaultItems).toBe(4)
    expect(res.body.recentActivity).toBe(2)
  })
})

// ── GET /api/items/enrichment ─────────────────────────────────────────────────

describe('GET /api/items/enrichment', () => {
  it('returns pending and total counts', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ pending: '749', total: '764' }],
    } as any)

    const res = await request(app).get('/api/items/enrichment').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.pending).toBe(749)
    expect(res.body.total).toBe(764)
  })
})

// ── GET /api/items/:id ────────────────────────────────────────────────────────

describe('GET /api/items/:id', () => {
  it('returns 404 for unknown id', async () => {
    mockClient([{ rows: [] }])
    const res = await request(app).get('/api/items/unknown').set('Authorization', AUTH)
    expect(res.status).toBe(404)
  })

  it('returns item for known id', async () => {
    mockClient([{ rows: [ITEM_ROW] }])
    const res = await request(app).get('/api/items/item-1').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('item-1')
  })
})

// ── POST /api/items ───────────────────────────────────────────────────────────

describe('POST /api/items', () => {
  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', AUTH)
      .send({ source: 'manual' })
    expect(res.status).toBe(400)
  })

  it('returns 201 with the created item', async () => {
    mockClient([
      null,                          // BEGIN
      { rows: [{ id: 'item-1' }] }, // INSERT items
      null,                          // COMMIT
      { rows: [ITEM_ROW] },          // fetchItem
    ])

    const res = await request(app)
      .post('/api/items')
      .set('Authorization', AUTH)
      .send({ content: 'Test content', source: 'manual', type: 'note', title: 'My Note' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('item-1')
  })
})

// ── PUT /api/items/:id ────────────────────────────────────────────────────────

describe('PUT /api/items/:id', () => {
  it('returns 404 when item does not exist', async () => {
    mockClient([
      null,            // BEGIN
      { rows: [] },    // SELECT id — not found
      null,            // ROLLBACK
    ])

    const res = await request(app)
      .put('/api/items/missing')
      .set('Authorization', AUTH)
      .send({ title: 'New title' })

    expect(res.status).toBe(404)
  })

  it('returns 200 with updated item', async () => {
    const updated = { ...ITEM_ROW, title: 'New title' }
    mockClient([
      null,                          // BEGIN
      { rows: [{ id: 'item-1' }] }, // SELECT id — found
      null,                          // UPDATE items
      null,                          // COMMIT
      { rows: [updated] },           // fetchItem
    ])

    const res = await request(app)
      .put('/api/items/item-1')
      .set('Authorization', AUTH)
      .send({ title: 'New title' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('New title')
  })
})

// ── DELETE /api/items/:id ─────────────────────────────────────────────────────

describe('DELETE /api/items/:id', () => {
  it('soft-deletes and returns 204', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1 } as any)

    const res = await request(app)
      .delete('/api/items/item-1')
      .set('Authorization', AUTH)

    expect(res.status).toBe(204)
    expect(vi.mocked(pool.query).mock.calls[0][0]).toContain('deleted_at')
  })

  it('returns 404 when item not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 0 } as any)

    const res = await request(app)
      .delete('/api/items/ghost')
      .set('Authorization', AUTH)

    expect(res.status).toBe(404)
  })
})
