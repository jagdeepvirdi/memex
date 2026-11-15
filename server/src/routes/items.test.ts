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
    intent: 'reference', model: 'llama3.2', confidence: 80,
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

  // INSERT params: [title, type, content, structured, source, sourceUrl, encrypted, reviewed, intent, priority, confidence]
  const insertParams = (client: ReturnType<typeof mockClient>) =>
    client.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO items'))![1] as unknown[]

  it('persists structured, intent, priority and confidence in the right INSERT slots', async () => {
    const client = mockClient([null, { rows: [{ id: 'item-1' }] }, null, { rows: [ITEM_ROW] }])
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', AUTH)
      .send({
        content: 'c', source: 'url', sourceUrl: 'https://github.com/a/b', type: 'link', title: 'a/b',
        structured: { kind: 'repo', repoName: 'a/b' }, intent: 'reference', priority: 'essential', confidence: 88,
      })

    expect(res.status).toBe(201)
    const p = insertParams(client)
    expect(p[4]).toBe('url')
    expect(p[5]).toBe('https://github.com/a/b')
    expect(JSON.parse(p[3] as string)).toEqual({ kind: 'repo', repoName: 'a/b' })
    expect(p.slice(8)).toEqual(['reference', 'essential', 88])
  })

  it('stores NULL for intent, priority and confidence when omitted', async () => {
    const client = mockClient([null, { rows: [{ id: 'item-1' }] }, null, { rows: [ITEM_ROW] }])
    await request(app).post('/api/items').set('Authorization', AUTH)
      .send({ content: 'c', source: 'manual', type: 'note', title: 't' })
    expect(insertParams(client).slice(8)).toEqual([null, null, null])
  })

  it('honours an explicit reviewed=false even when type and title are supplied', async () => {
    const client = mockClient([null, { rows: [{ id: 'item-1' }] }, null, { rows: [ITEM_ROW] }])
    await request(app).post('/api/items').set('Authorization', AUTH)
      .send({ content: 'c', source: 'manual', type: 'note', title: 't', reviewed: false })
    expect(insertParams(client)[7]).toBe(false)
  })

  it('still defaults reviewed=true when the caller supplies type and title', async () => {
    const client = mockClient([null, { rows: [{ id: 'item-1' }] }, null, { rows: [ITEM_ROW] }])
    await request(app).post('/api/items').set('Authorization', AUTH)
      .send({ content: 'c', source: 'manual', type: 'note', title: 't' })
    expect(insertParams(client)[7]).toBe(true)
  })

  it('rejects an invalid priority and an out-of-range confidence', async () => {
    const base = { content: 'c', source: 'manual', type: 'note', title: 't' }
    expect((await request(app).post('/api/items').set('Authorization', AUTH).send({ ...base, priority: 'urgent' })).status).toBe(400)
    expect((await request(app).post('/api/items').set('Authorization', AUTH).send({ ...base, confidence: 101 })).status).toBe(400)
  })
})

// ── priority on PUT and list ─────────────────────────────────────────────────

describe('priority', () => {
  it('PUT accepts a valid priority, null (clear) and rejects an invalid one', async () => {
    for (const priority of ['skip', null]) {
      const client = mockClient([null, { rows: [{ id: 'item-1' }] }, null, null, { rows: [ITEM_ROW] }])
      const res = await request(app).put('/api/items/item-1').set('Authorization', AUTH).send({ priority })
      expect(res.status).toBe(200)
      const update = client.query.mock.calls.find((c) => String(c[0]).includes('priority ='))
      expect(update![1]).toContain(priority)
    }
    const bad = await request(app).put('/api/items/item-1').set('Authorization', AUTH).send({ priority: 'urgent' })
    expect(bad.status).toBe(400)
  })

  it('GET filters by priority, supports none, and rejects an invalid value', async () => {
    for (const [value, expected] of [['essential', 'essential'], ['none', null]] as const) {
      const client = mockClient([{ rows: [{ total: '1' }] }, { rows: [ITEM_ROW] }])
      const res = await request(app).get(`/api/items?priority=${value}`).set('Authorization', AUTH)
      expect(res.status).toBe(200)
      const sql = client.query.mock.calls.map((c) => String(c[0])).join('\n')
      expect(sql).toContain(expected ? 'i.priority = $' : 'i.priority IS NULL')
    }
    expect((await request(app).get('/api/items?priority=bogus').set('Authorization', AUTH)).status).toBe(400)
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

// ── GET /api/items — maxConfidence filter ────────────────────────────────────

describe('GET /api/items with maxConfidence filter', () => {
  it('returns 200 and filters by maxConfidence', async () => {
    mockClient([{ rows: [{ total: '1' }] }, { rows: [ITEM_ROW] }])
    const res = await request(app)
      .get('/api/items?maxConfidence=70')
      .set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
  })

  it('rejects non-numeric maxConfidence', async () => {
    const res = await request(app)
      .get('/api/items?maxConfidence=abc')
      .set('Authorization', AUTH)
    expect(res.status).toBe(400)
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

// ── POST /api/items/reprocess-bulk ───────────────────────────────────────────

describe('POST /api/items/reprocess-bulk', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/items/reprocess-bulk')
    expect(res.status).toBe(401)
  })

  it('returns queued: 0 when no items match', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app)
      .post('/api/items/reprocess-bulk')
      .set('Authorization', AUTH)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.queued).toBe(0)
  })

  it('returns queued count immediately for matched items', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { id: 'item-1', title: 'Note 1', content: 'Content 1' },
        { id: 'item-2', title: 'Note 2', content: 'Content 2' },
      ],
    } as any)
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ reviewed: false }] })
        .mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }
    vi.mocked(pool.connect).mockResolvedValue(client as any)

    const res = await request(app)
      .post('/api/items/reprocess-bulk')
      .set('Authorization', AUTH)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.queued).toBe(2)
  })
})

// ── POST /api/items/:id/re-classify ──────────────────────────────────────────

describe('POST /api/items/:id/re-classify', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/items/item-1/re-classify')
    expect(res.status).toBe(401)
  })

  it('returns 404 when item does not exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app)
      .post('/api/items/ghost/re-classify')
      .set('Authorization', AUTH)
    expect(res.status).toBe(404)
  })

  it('returns 201 with new extraction (applied=false)', async () => {
    const EXTRACTION_ROW = {
      id: 'ext-1', item_id: 'item-1', model: 'llama3.2',
      type: 'note', title: 'AI Title', summary: 'A summary',
      structured: {}, categories: [], tags: [],
      confidence: 80, applied: false, intent: 'reference',
      created_at: new Date().toISOString(),
    }
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ title: 'Test', content: 'Content' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'ext-1' }] } as any)
      .mockResolvedValueOnce({ rows: [EXTRACTION_ROW] } as any)

    const res = await request(app)
      .post('/api/items/item-1/re-classify')
      .set('Authorization', AUTH)
    expect(res.status).toBe(201)
    expect(res.body.id).toBe('ext-1')
    expect(res.body.applied).toBe(false)
    expect(res.body.intent).toBe('reference')
  })
})

describe('POST /api/items/:id/re-classify privacy guard', () => {
  const run = async (itemRow: Record<string, unknown>) => {
    const { classify } = await import('../services/classifier')
    vi.mocked(classify).mockClear()
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [itemRow] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'ext-1' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'ext-1', applied: false }] } as any)
    await request(app).post('/api/items/item-1/re-classify').set('Authorization', AUTH)
    return vi.mocked(classify).mock.calls[0][1]
  }

  it('marks an ordinary item cloud-safe', async () => {
    expect(await run({ title: 'T', content: 'C', categories: ['Food'], tags: [] })).toEqual({ cloudSafe: true })
  })

  it('keeps a vault/private item on local models', async () => {
    expect(await run({ title: 'T', content: 'C', categories: ['Passwords'], tags: [] })).toEqual({ cloudSafe: false })
    expect(await run({ title: 'T', content: 'C', encrypted: true })).toEqual({ cloudSafe: false })
  })
})

// ── PUT /api/items/bulk/priority ──────────────────────────────────────────────

describe('PUT /api/items/bulk/priority', () => {
  const ID1 = '11111111-1111-4111-8111-111111111111'
  const ID2 = '22222222-2222-4222-8222-222222222222'
  const put = (body: unknown) => request(app).put('/api/items/bulk/priority').set('Authorization', AUTH).send(body as object)

  it('requires auth', async () => {
    expect((await request(app).put('/api/items/bulk/priority').send({ ids: [ID1], priority: 'useful' })).status).toBe(401)
  })

  it.each([
    ['missing ids', { priority: 'useful' }],
    ['empty ids', { ids: [], priority: 'useful' }],
    ['non-uuid id', { ids: ['abc'], priority: 'useful' }],
    ['unknown priority', { ids: [ID1], priority: 'urgent' }],
    ['missing priority', { ids: [ID1] }],
    ['too many ids', { ids: Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), priority: 'skip' }],
  ])('400s on %s', async (_n, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('sets the priority on live items only, once per distinct id, and returns the count', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 2 } as any)
    const res = await put({ ids: [ID1, ID2, ID1], priority: 'essential' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ count: 2 })
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(sql).toMatch(/UPDATE items SET priority = \$1/)
    expect(sql).toMatch(/deleted_at IS NULL/)
    expect(params).toEqual(['essential', [ID1, ID2]])
  })

  it('clears the priority when null is sent', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
    const res = await put({ ids: [ID1], priority: null })
    expect(res.status).toBe(200)
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual([null, [ID1]])
  })

  it('is not shadowed by /:id routes', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
    const res = await put({ ids: [ID1], priority: 'skip' })
    expect(res.body).toEqual({ count: 0 })
  })

  it('500s when the update fails', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db'))
    expect((await put({ ids: [ID1], priority: 'skip' })).status).toBe(500)
  })
})
