import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from './index'
import { pool } from './db/client'

// The bookmarklet key lives in a browser bookmark, so through the REAL auth middleware it may do one thing:
// POST /api/ingest/quicksave. Everything else needs a login session.

vi.mock('./db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('./services/embeddingWorker', () => ({ startEmbeddingWorker: vi.fn() }))

const KEY = 'f00dbabe'.repeat(6) // 48 chars, same shape as the generated key
let SESSION = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  SESSION = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

/** Mimics pg + JSONB: the stored string comes back already parsed — no JSON quotes. */
function storedKey(value: unknown | null = KEY) {
  vi.mocked(pool.query).mockImplementation((async (sql: string) =>
    /FROM settings WHERE key = 'bookmarklet_key'/.test(sql) ? { rows: value === null ? [] : [{ value }] } : { rows: [] }) as never)
}
const bm = (r: request.Test, key = KEY) => r.set('Authorization', `Bearer ${key}`)

beforeEach(() => {
  vi.clearAllMocks()
  storedKey()
})

describe('bookmarklet key — allowed', () => {
  it('reaches the quicksave route (400 for the missing url proves auth and routing both passed)', async () => {
    const res = await bm(request(app).post('/api/ingest/quicksave').send({}))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/url/i)
  })

  it('also works with a query string and a trailing slash', async () => {
    expect((await bm(request(app).post('/api/ingest/quicksave/?src=bm').send({}))).status).toBe(400)
  })
})

describe('bookmarklet key — everything else is refused with 403', () => {
  const cases: Array<[string, string]> = [
    ['get', '/api/items'], ['get', '/api/items/export/obsidian'], ['get', '/api/items/digest'], ['delete', '/api/items/bulk'],
    ['put', '/api/items/bulk/priority'], ['get', '/api/settings'], ['put', '/api/settings'],
    ['post', '/api/settings/bookmarklet-key'], ['get', '/api/vault'], ['post', '/api/vault/reset'], ['put', '/api/vault/rekey'],
    ['get', '/api/ai/keys'], ['put', '/api/ai/keys/claude'], ['delete', '/api/ai/keys/claude'], ['post', '/api/ai/test'],
    ['post', '/api/ingest/text'], ['post', '/api/ingest/url'], ['post', '/api/ingest/keep/bulk'], ['post', '/api/ingest/paste/bulk'],
    ['post', '/api/ingest/youtube/backfill'], ['get', '/api/ingest/jobs/abc'], ['post', '/api/search'], ['get', '/api/categories'],
    ['get', '/api/tags'],
  ]
  it.each(cases)('%s %s', async (method, path) => {
    const res = await bm((request(app) as any)[method](path).send({}))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/only be used to save pages/)
  })

  it('refuses other methods on the quicksave path', async () => {
    expect((await bm(request(app).get('/api/ingest/quicksave'))).status).toBe(403)
    expect((await bm(request(app).delete('/api/ingest/quicksave'))).status).toBe(403)
  })

  it('refuses look-alike paths', async () => {
    expect((await bm(request(app).post('/api/ingest/quicksave/extra').send({}))).status).toBe(403)
    expect((await bm(request(app).post('/api/ingest/quicksave/../items').send({}))).status).toBe(403)
  })

  it('never reads or exposes the key through any refused route', async () => {
    const res = await bm(request(app).get('/api/settings'))
    expect(JSON.stringify(res.body)).not.toContain(KEY)
  })
})

describe('bookmarklet key — rejected when it is not the stored key', () => {
  it('401 for a wrong key, including one that is a prefix or has extra characters', async () => {
    for (const k of ['0'.repeat(48), KEY.slice(0, 47), KEY + '0', '', 'short']) {
      const res = await bm(request(app).post('/api/ingest/quicksave').send({}), k)
      expect(res.status).toBe(401)
    }
  })

  it('401 when no bookmarklet key has been generated', async () => {
    storedKey(null)
    expect((await bm(request(app).post('/api/ingest/quicksave').send({}))).status).toBe(401)
  })

  it('401 when the stored value is not a usable string (null, number, object, too short)', async () => {
    for (const v of [42, { k: KEY }, 'short', JSON.stringify(KEY)]) {
      storedKey(v)
      expect((await bm(request(app).post('/api/ingest/quicksave').send({}))).status).toBe(401)
    }
  })

  it('401, never a crash or a free pass, when the lookup fails', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('db down'))
    expect((await bm(request(app).post('/api/ingest/quicksave').send({}))).status).toBe(401)
  })

  it('401 with no token at all', async () => {
    expect((await request(app).post('/api/ingest/quicksave').send({})).status).toBe(401)
  })

  it('a regenerated key invalidates the old one at once', async () => {
    storedKey('1234abcd'.repeat(6))
    expect((await bm(request(app).post('/api/ingest/quicksave').send({}), KEY)).status).toBe(401)
    expect((await bm(request(app).post('/api/ingest/quicksave').send({}), '1234abcd'.repeat(6))).status).toBe(400)
  })
})

describe('login sessions are unaffected', () => {
  it('a JWT still reaches the routes the bookmarklet cannot', async () => {
    const res = await request(app).get('/api/ai/keys').set('Authorization', SESSION)
    expect(res.status).toBe(200)
  })

  it('a JWT can still use quicksave', async () => {
    const res = await request(app).post('/api/ingest/quicksave').set('Authorization', SESSION).send({})
    expect(res.status).toBe(400)
  })

  it('public paths still need no token', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200)
  })
})
