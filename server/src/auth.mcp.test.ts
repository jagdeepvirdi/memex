import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from './index'
import { pool } from './db/client'
import { generateMcpKey, hashMcpKey } from './lib/mcpScope'

// The MCP key goes to an AI assistant, so through the REAL auth middleware it may reach the /api/mcp routes and
// nothing else. Only its hash is stored.

vi.mock('./db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('./services/embeddingWorker', () => ({ startEmbeddingWorker: vi.fn() }))
vi.mock('./services/retrievalService', () => ({
  retrieveItems: vi.fn().mockResolvedValue({ items: [], semantic: true }),
  COLUMNS: 'i.id',
}))

const KEY = generateMcpKey()
let SESSION = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  SESSION = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

/** Mimics pg + JSONB: the stored hash comes back as a bare string. */
function storedHash(value: unknown | null = hashMcpKey(KEY)) {
  vi.mocked(pool.query).mockImplementation((async (sql: string) =>
    /FROM settings WHERE key = 'mcp_key_hash'/.test(sql) ? { rows: value === null ? [] : [{ value }] } : { rows: [] }) as never)
}
const mcp = (r: request.Test, key = KEY) => r.set('Authorization', `Bearer ${key}`)

beforeEach(() => {
  vi.clearAllMocks()
  storedHash()
})

describe('MCP key: allowed', () => {
  it('reaches the search route (400 for the missing q proves auth and routing passed)', async () => {
    const res = await mcp(request(app).get('/api/mcp/search'))
    expect(res.status).toBe(400)
  })
  it('reaches search with a query and gets results', async () => {
    const res = await mcp(request(app).get('/api/mcp/search?q=pasta'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ results: [], semantic: true, withheldPrivate: 0 })
  })
  it('reaches notes and links (400 for an empty body)', async () => {
    expect((await mcp(request(app).post('/api/mcp/notes').send({}))).status).toBe(400)
    expect((await mcp(request(app).post('/api/mcp/links').send({}))).status).toBe(400)
  })
})

describe('MCP key: everything else is refused with 403', () => {
  const cases: Array<[string, string]> = [
    ['get', '/api/items'], ['get', '/api/items/export/obsidian'], ['delete', '/api/items/bulk'], ['get', '/api/settings'],
    ['put', '/api/settings'], ['post', '/api/settings/mcp-key'], ['delete', '/api/settings/mcp-key'],
    ['post', '/api/settings/bookmarklet-key'], ['get', '/api/vault'], ['post', '/api/vault/reset'], ['get', '/api/ai/keys'],
    ['put', '/api/ai/keys/claude'], ['post', '/api/ai/test'], ['post', '/api/search'], ['post', '/api/search/ask'],
    ['post', '/api/ingest/text'], ['post', '/api/ingest/quicksave'], ['get', '/api/categories'], ['get', '/api/tags'],
    ['post', '/api/mcp/search'], ['delete', '/api/mcp/items/abc'], ['put', '/api/mcp/notes'], ['get', '/api/mcp/unknown'],
  ]
  it.each(cases)('%s %s', async (method, path) => {
    const res = await mcp((request(app) as any)[method](path).send({}))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/AI assistant/)
  })
})

describe('MCP key: not accepted', () => {
  it('a wrong key is 401', async () => {
    expect((await mcp(request(app).get('/api/mcp/recent'), generateMcpKey())).status).toBe(401)
  })
  it('no key stored (revoked) is 401', async () => {
    storedHash(null)
    expect((await mcp(request(app).get('/api/mcp/recent'))).status).toBe(401)
  })
  it('the stored hash is not a usable token', async () => {
    expect((await mcp(request(app).get('/api/mcp/recent'), hashMcpKey(KEY))).status).toBe(401)
  })
  it('no Authorization header is 401', async () => {
    expect((await request(app).get('/api/mcp/recent')).status).toBe(401)
  })
})

describe('a login session', () => {
  it('can use the mcp routes too (a session is the user)', async () => {
    const res = await request(app).get('/api/mcp/search?q=pasta').set('Authorization', SESSION)
    expect(res.status).toBe(200)
  })
})
