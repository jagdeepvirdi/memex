import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { retrieveItems } from '../services/retrievalService'
import { quickSaveText, quickSaveUrl } from '../services/quickSave'
import { hashMcpKey } from '../lib/mcpScope'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/embeddingWorker', () => ({ startEmbeddingWorker: vi.fn() }))
vi.mock('../services/retrievalService', () => ({ retrieveItems: vi.fn(), COLUMNS: 'i.id' }))
vi.mock('../services/quickSave', () => ({ quickSaveText: vi.fn(), quickSaveUrl: vi.fn() }))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const ID = '3f2b8c1e-0000-4000-8000-000000000001'

// Synthetic items only.
const item = (over: Record<string, unknown> = {}) => ({
  id: ID, title: 'Lemon chicken', type: 'recipe', content: 'Roast thighs with lemon and thyme.',
  structured: { summary: 'A simple roast.' }, categories: ['Food', 'Savory'], tags: ['dinner'],
  source: 'manual', sourceUrl: undefined, encrypted: false, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  reviewed: true, ...over,
})
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, title: 'Lemon chicken', type: 'recipe', content: 'Roast thighs with lemon and thyme.', structured: { summary: 'A simple roast.' },
  source: 'manual', source_url: null, encrypted: false, reviewed: true, created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01'),
  categories: ['Food', 'Savory'], tags: ['dinner'], ...over,
})

const PRIVATE = [
  item({ id: 'p1', title: 'Wi-Fi', type: 'password', encrypted: true, content: 'ciphertext' }),
  item({ id: 'p2', title: 'Taxes', categories: ['Personal', 'Numbers'] }),
  item({ id: 'p3', title: 'Gift ideas', tags: ['Private'] }),
  item({ id: 'p4', title: 'Bank', content: 'Landlord bank details, account number 0012 3456 7890' }),
]

let strictLocal = false
beforeEach(() => {
  vi.clearAllMocks()
  strictLocal = false
  vi.mocked(pool.query).mockImplementation((async (sql: string) => {
    if (/key = \$1/.test(sql) && /FROM settings/.test(sql)) return { rows: strictLocal ? [{ value: true }] : [] }
    return { rows: [] }
  }) as never)
})

describe('GET /api/mcp/search', () => {
  it('returns short entries, never the full content, and keeps the order', async () => {
    const long = 'x'.repeat(900)
    vi.mocked(retrieveItems).mockResolvedValue({ items: [item({ id: 'a', content: long }), item({ id: 'b' })] as never, semantic: true })
    const res = await request(app).get('/api/mcp/search?q=chicken').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.results.map((r: { id: string }) => r.id)).toEqual(['a', 'b'])
    expect(res.body.results[0].snippet.length).toBeLessThanOrEqual(404)
    expect(res.body.results[0].summary).toBe('A simple roast.')
    expect(res.body.results[0]).not.toHaveProperty('content')
    expect(res.body.semantic).toBe(true)
  })

  it('drops every kind of private item and reports only how many (no titles, no reasons)', async () => {
    vi.mocked(retrieveItems).mockResolvedValue({ items: [item(), ...PRIVATE] as never, semantic: true })
    const res = await request(app).get('/api/mcp/search?q=anything').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.results.map((r: { id: string }) => r.id)).toEqual([ID])
    expect(res.body.withheldPrivate).toBe(4)
    const text = JSON.stringify(res.body)
    for (const p of PRIVATE) {
      expect(text).not.toContain(p.title)
      expect(text).not.toContain(p.id)
    }
    expect(text).not.toMatch(/ciphertext|0012 3456|account number/)
    expect(text).not.toMatch(/"reason"/)
  })

  it('asks for extra rows so dropping private ones still fills the page, then trims to limit', async () => {
    const many = Array.from({ length: 20 }, (_, i) => item({ id: `i${i}` }))
    vi.mocked(retrieveItems).mockResolvedValue({ items: many as never, semantic: false })
    const res = await request(app).get('/api/mcp/search?q=x&limit=3').set('Authorization', AUTH)
    expect(res.body.results).toHaveLength(3)
    expect(res.body.semantic).toBe(false)
    expect(vi.mocked(retrieveItems).mock.calls[0][0].limit).toBeGreaterThan(3)
  })

  it('validates the query', async () => {
    expect((await request(app).get('/api/mcp/search').set('Authorization', AUTH)).status).toBe(400)
    expect((await request(app).get('/api/mcp/search?q=').set('Authorization', AUTH)).status).toBe(400)
    expect((await request(app).get('/api/mcp/search?q=x&limit=500').set('Authorization', AUTH)).status).toBe(400)
    expect((await request(app).get('/api/mcp/search?q=x&type=bogus').set('Authorization', AUTH)).status).toBe(400)
  })

  it('answers 500 with a plain message when retrieval fails', async () => {
    vi.mocked(retrieveItems).mockRejectedValue(new Error('db down: secret internals'))
    const res = await request(app).get('/api/mcp/search?q=x').set('Authorization', AUTH)
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Search failed')
  })
})

describe('GET /api/mcp/recent', () => {
  it('lists newest first, filters private items and counts them', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (/FROM settings/.test(sql)) return { rows: [] }
      return { rows: [row(), row({ id: 'p2', title: 'Taxes', categories: ['Personal'] }), row({ id: 'b', title: 'Second' })] }
    }) as never)
    const res = await request(app).get('/api/mcp/recent?limit=5').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.results.map((r: { title: string }) => r.title)).toEqual(['Lemon chicken', 'Second'])
    expect(res.body.withheldPrivate).toBe(1)
  })

  it('never selects encrypted rows from the database', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => (/FROM settings/.test(sql) ? { rows: [] } : { rows: [] })) as never)
    await request(app).get('/api/mcp/recent').set('Authorization', AUTH)
    const sql = vi.mocked(pool.query).mock.calls.map(c => String(c[0])).find(s => /FROM items i/.test(s)) ?? ''
    expect(sql).toMatch(/i\.encrypted = false/)
    expect(sql).toMatch(/i\.deleted_at IS NULL/)
  })

  it('validates limit', async () => {
    expect((await request(app).get('/api/mcp/recent?limit=999').set('Authorization', AUTH)).status).toBe(400)
  })
})

describe('GET /api/mcp/items/:id', () => {
  it('returns the full item', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => (/FROM settings/.test(sql) ? { rows: [] } : { rows: [row()] })) as never)
    const res = await request(app).get(`/api/mcp/items/${ID}`).set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ID, title: 'Lemon chicken', content: 'Roast thighs with lemon and thyme.', tags: ['dinner'] })
    expect(res.body).not.toHaveProperty('embedding')
    expect(res.body).not.toHaveProperty('publicToken')
  })

  it('truncates very long content and says so', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => (/FROM settings/.test(sql) ? { rows: [] } : { rows: [row({ content: 'y'.repeat(25_000) })] })) as never)
    const res = await request(app).get(`/api/mcp/items/${ID}`).set('Authorization', AUTH)
    expect(res.body.content.length).toBe(20_000)
    expect(res.body.contentTruncated).toBe(true)
  })

  it.each([
    ['an encrypted password item', { type: 'password', encrypted: true, content: 'ciphertext' }],
    ['one in a Personal category', { categories: ['Personal'] }],
    ['one tagged private', { tags: ['private'] }],
    ['one that looks like account details', { content: 'IBAN GB29 NWBK 6016 1331 9268 19' }],
  ])('refuses %s with 403 and no content', async (_name, over) => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => (/FROM settings/.test(sql) ? { rows: [] } : { rows: [row(over)] })) as never)
    const res = await request(app).get(`/api/mcp/items/${ID}`).set('Authorization', AUTH)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/private/)
    expect(JSON.stringify(res.body)).not.toMatch(/ciphertext|IBAN|Lemon/)
  })

  it('404 for an unknown id, 400 for a malformed one', async () => {
    expect((await request(app).get(`/api/mcp/items/${ID}`).set('Authorization', AUTH)).status).toBe(404)
    expect((await request(app).get('/api/mcp/items/not-an-id').set('Authorization', AUTH)).status).toBe(400)
  })
})

describe('POST /api/mcp/notes', () => {
  it('saves through quickSaveText, tagged from-mcp plus the caller tags, and answers 201', async () => {
    vi.mocked(quickSaveText).mockResolvedValue({ item: { id: 'n1', title: 'T', type: 'note' }, similarItems: [] })
    const res = await request(app).post('/api/mcp/notes').set('Authorization', AUTH).send({ content: 'Buy lemons', title: 'Shopping', tags: ['errands'] })
    expect(res.status).toBe(201)
    expect(res.body.item.id).toBe('n1')
    expect(quickSaveText).toHaveBeenCalledWith('Buy lemons', { title: 'Shopping', extraTags: ['from-mcp', 'errands'] })
  })

  it('validates the body', async () => {
    for (const body of [{}, { content: '' }, { content: 'x'.repeat(20_001) }, { content: 'ok', tags: new Array(11).fill('t') }, { content: 'ok', title: 5 }]) {
      expect((await request(app).post('/api/mcp/notes').set('Authorization', AUTH).send(body)).status).toBe(400)
    }
    expect(quickSaveText).not.toHaveBeenCalled()
  })

  it('reports a failed save as 500', async () => {
    vi.mocked(quickSaveText).mockRejectedValue(new Error('Failed to classify'))
    const res = await request(app).post('/api/mcp/notes').set('Authorization', AUTH).send({ content: 'x' })
    expect(res.status).toBe(500)
  })
})

describe('POST /api/mcp/links', () => {
  it('saves a page through quickSaveUrl with the from-mcp tag', async () => {
    vi.mocked(quickSaveUrl).mockResolvedValue({ item: { id: 'l1', title: 'Page', type: 'link' }, similarItems: [] })
    const res = await request(app).post('/api/mcp/links').set('Authorization', AUTH).send({ url: 'https://example.com/a' })
    expect(res.status).toBe(201)
    expect(quickSaveUrl).toHaveBeenCalledWith('https://example.com/a', { extraTags: ['from-mcp'] })
  })

  it('passes a duplicate through so the assistant can say it was already saved', async () => {
    vi.mocked(quickSaveUrl).mockResolvedValue({ item: { id: 'l1', title: 'Page', type: 'link' }, similarItems: [], duplicate: true })
    const res = await request(app).post('/api/mcp/links').set('Authorization', AUTH).send({ url: 'https://example.com/a' })
    expect(res.body.duplicate).toBe(true)
  })

  it.each([{}, { url: 'nope' }, { url: 'ftp://example.com/x' }, { url: 'javascript:alert(1)' }, { url: 5 }])('rejects %j', async body => {
    expect((await request(app).post('/api/mcp/links').set('Authorization', AUTH).send(body)).status).toBe(400)
    expect(quickSaveUrl).not.toHaveBeenCalled()
  })
})

describe('Strict Local Mode', () => {
  it('turns every assistant route off with an explanation', async () => {
    strictLocal = true
    const calls: Array<Promise<request.Response>> = [
      request(app).get('/api/mcp/search?q=x').set('Authorization', AUTH),
      request(app).get('/api/mcp/recent').set('Authorization', AUTH),
      request(app).get(`/api/mcp/items/${ID}`).set('Authorization', AUTH),
      request(app).post('/api/mcp/notes').set('Authorization', AUTH).send({ content: 'x' }),
      request(app).post('/api/mcp/links').set('Authorization', AUTH).send({ url: 'https://example.com' }),
    ]
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/Strict Local Mode/)
    }
    expect(retrieveItems).not.toHaveBeenCalled()
    expect(quickSaveText).not.toHaveBeenCalled()
    expect(quickSaveUrl).not.toHaveBeenCalled()
  })
})

describe('POST / DELETE /api/settings/mcp-key', () => {
  it('creates a key, shows it once, and stores only its hash', async () => {
    const res = await request(app).post('/api/settings/mcp-key').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    const key: string = res.body.key
    expect(key).toMatch(/^mxk_[0-9a-f]{48}$/)
    const write = vi.mocked(pool.query).mock.calls.find(c => /INSERT INTO settings/.test(String(c[0])))!
    expect(String(write[0])).toContain("'mcp_key_hash'")
    const stored = JSON.parse((write[1] as string[])[0])
    expect(stored).toBe(hashMcpKey(key))
    expect(JSON.stringify(write)).not.toContain(key)
  })

  it('gives a different key every time (regenerating replaces the old one)', async () => {
    const a = (await request(app).post('/api/settings/mcp-key').set('Authorization', AUTH)).body.key
    const b = (await request(app).post('/api/settings/mcp-key').set('Authorization', AUTH)).body.key
    expect(a).not.toBe(b)
  })

  it('revokes by deleting the stored hash', async () => {
    const res = await request(app).delete('/api/settings/mcp-key').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(vi.mocked(pool.query).mock.calls.some(c => /DELETE FROM settings WHERE key = 'mcp_key_hash'/.test(String(c[0])))).toBe(true)
  })

  it('needs a real login session', async () => {
    expect((await request(app).post('/api/settings/mcp-key')).status).toBe(401)
    expect((await request(app).delete('/api/settings/mcp-key')).status).toBe(401)
  })
})
