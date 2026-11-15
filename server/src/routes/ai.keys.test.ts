import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { resetApiKeyCache, KEY_ENV } from '../services/apiKeys'
import { checkYoutubeKey } from '../services/youtubeApi'

vi.hoisted(() => { process.env.AI_KEY_RATE_LIMIT_MAX = '1000'; process.env.AI_TEST_RATE_LIMIT_MAX = '1000' })

// One fake database behind pool.query: the `api_keys` table plus the bookmarklet-key lookup the auth
// middleware does, so the real service, real encryption and real routes all run.
let table: Array<{ provider: string; ciphertext: string; iv: string; last4: string }> = []
let bookmarkletKey: string | null = null
let tableMissing = false

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/youtubeApi', async orig => ({
  ...(await orig<typeof import('../services/youtubeApi')>()),
  checkYoutubeKey: vi.fn(),
}))

let AUTH = ''
const SECRET = 'sk-ant-api03-SUPERSECRETKEYVALUE-1234'

beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

beforeEach(() => {
  vi.clearAllMocks()
  table = []
  bookmarkletKey = null
  tableMissing = false
  resetApiKeyCache()
  for (const v of Object.values(KEY_ENV)) delete process.env[v]
  vi.mocked(pool.query).mockImplementation((async (sql: string, params: unknown[] = []) => {
    if (/FROM settings WHERE key = 'bookmarklet_key'/.test(sql)) {
      return { rows: bookmarkletKey ? [{ value: JSON.stringify(bookmarkletKey) }] : [] }
    }
    if (/api_keys/.test(sql) && tableMissing) throw Object.assign(new Error('relation "api_keys" does not exist'), { code: '42P01' })
    if (/^\s*SELECT .* FROM api_keys/.test(sql)) return { rows: table.map(r => ({ ...r })) }
    if (/INSERT INTO api_keys/.test(sql)) {
      const [provider, ciphertext, iv, last4] = params as string[]
      table = [...table.filter(r => r.provider !== provider), { provider, ciphertext, iv, last4 }]
      return { rows: [], rowCount: 1 }
    }
    if (/DELETE FROM api_keys/.test(sql)) {
      table = table.filter(r => r.provider !== params[0])
      return { rows: [], rowCount: 1 }
    }
    return { rows: [] }
  }) as never)
})

const auth = (r: request.Test) => r.set('Authorization', AUTH)

describe('API key routes — access', () => {
  it('require a login', async () => {
    expect((await request(app).get('/api/ai/keys')).status).toBe(401)
    expect((await request(app).put('/api/ai/keys/claude').send({ key: SECRET })).status).toBe(401)
    expect((await request(app).delete('/api/ai/keys/claude')).status).toBe(401)
    expect((await request(app).post('/api/ai/keys/youtube/test')).status).toBe(401)
  })

  it('refuse the bookmarklet key: it lives in a browser bookmark and must not read or replace keys', async () => {
    bookmarkletKey = 'bookmarklet-key-0123456789abcdef'
    const bm = (r: request.Test) => r.set('Authorization', `Bearer ${bookmarkletKey}`)
    expect((await bm(request(app).get('/api/ai/keys'))).status).toBe(403)
    expect((await bm(request(app).put('/api/ai/keys/claude').send({ key: SECRET }))).status).toBe(403)
    expect((await bm(request(app).delete('/api/ai/keys/claude'))).status).toBe(403)
    expect((await bm(request(app).post('/api/ai/keys/youtube/test'))).status).toBe(403)
    expect(table).toHaveLength(0)
  })
})

describe('GET /api/ai/keys', () => {
  it('lists the three providers as unconfigured by default', async () => {
    const res = await auth(request(app).get('/api/ai/keys'))
    expect(res.status).toBe(200)
    expect(res.body.map((k: { provider: string }) => k.provider)).toEqual(['claude', 'gemini', 'youtube'])
    expect(res.body.every((k: { configured: boolean }) => !k.configured)).toBe(true)
  })

  it('reports an environment key as the one in effect, with only its last four characters', async () => {
    process.env.GEMINI_API_KEY = 'AIzaEnvironmentKeyNeverShown9876'
    const res = await auth(request(app).get('/api/ai/keys'))
    const g = res.body.find((k: { provider: string }) => k.provider === 'gemini')
    expect(g).toMatchObject({ configured: true, source: 'env', last4: '9876' })
    expect(JSON.stringify(res.body)).not.toContain('NeverShown')
  })
})

describe('PUT /api/ai/keys/:provider', () => {
  it('saves the key encrypted and returns only its status', async () => {
    const res = await auth(request(app).put('/api/ai/keys/claude').send({ key: `  ${SECRET} ` }))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ provider: 'claude', configured: true, source: 'stored', last4: '1234', hasStored: true })
    expect(JSON.stringify(res.body)).not.toContain('SUPERSECRET')

    expect(table).toHaveLength(1)
    expect(JSON.stringify(table[0])).not.toContain('SUPERSECRET')
    expect(table[0].last4).toBe('1234')
  })

  it('shows up in the listing afterwards, still without the key', async () => {
    await auth(request(app).put('/api/ai/keys/gemini').send({ key: 'AIzaSyGeminiSecretValueXYZ0001' }))
    const res = await auth(request(app).get('/api/ai/keys'))
    expect(res.body.find((k: { provider: string }) => k.provider === 'gemini')).toMatchObject({ configured: true, source: 'stored', last4: '0001' })
    expect(JSON.stringify(res.body)).not.toContain('SecretValue')
  })

  it('replaces a saved key', async () => {
    await auth(request(app).put('/api/ai/keys/youtube').send({ key: 'AIzaSyFirstKeyFirstKeyFirst1111' }))
    const res = await auth(request(app).put('/api/ai/keys/youtube').send({ key: 'AIzaSySecondKeySecondKey2222' }))
    expect(res.body.last4).toBe('2222')
    expect(table).toHaveLength(1)
  })

  it('rejects an unknown provider', async () => {
    const res = await auth(request(app).put('/api/ai/keys/openai').send({ key: SECRET }))
    expect(res.status).toBe(400)
    expect(table).toHaveLength(0)
  })

  it.each([
    ['missing key', {}],
    ['non-string key', { key: 12345678 }],
    ['too short', { key: 'abc' }],
    ['spaces inside', { key: 'sk-ant key with spaces in' }],
    ['too long', { key: 'a'.repeat(500) }],
  ])('rejects %s with a 400 and saves nothing', async (_n, body) => {
    const res = await auth(request(app).put('/api/ai/keys/claude').send(body))
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    expect(table).toHaveLength(0)
  })

  it('does not echo a rejected key back in the error', async () => {
    const res = await auth(request(app).put('/api/ai/keys/claude').send({ key: 'has spaces SECRETPART inside it' }))
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toContain('SECRETPART')
  })

  it('tells you to run the migration when the table does not exist yet', async () => {
    tableMissing = true
    const res = await auth(request(app).put('/api/ai/keys/claude').send({ key: SECRET }))
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/npm run migrate/)
  })
})

describe('DELETE /api/ai/keys/:provider', () => {
  it('removes a saved key', async () => {
    await auth(request(app).put('/api/ai/keys/claude').send({ key: SECRET }))
    const res = await auth(request(app).delete('/api/ai/keys/claude'))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ provider: 'claude', configured: false, hasStored: false })
    expect(table).toHaveLength(0)
  })

  it('leaves an environment key in effect', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-claude-key-value-4321'
    await auth(request(app).put('/api/ai/keys/claude').send({ key: SECRET }))
    const res = await auth(request(app).delete('/api/ai/keys/claude'))
    expect(res.body).toMatchObject({ configured: true, source: 'env', last4: '4321', hasStored: false })
  })

  it('rejects an unknown provider', async () => {
    expect((await auth(request(app).delete('/api/ai/keys/nope'))).status).toBe(400)
  })

  it('tells you to run the migration when the table does not exist yet', async () => {
    tableMissing = true
    expect((await auth(request(app).delete('/api/ai/keys/claude'))).status).toBe(503)
  })
})

describe('POST /api/ai/keys/youtube/test', () => {
  it('reports success', async () => {
    vi.mocked(checkYoutubeKey).mockResolvedValue({ ok: true })
    const res = await auth(request(app).post('/api/ai/keys/youtube/test'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('reports a failure inline (200 with ok:false), with the kind and a message', async () => {
    vi.mocked(checkYoutubeKey).mockResolvedValue({ ok: false, kind: 'quota', error: 'quota exceeded' })
    const res = await auth(request(app).post('/api/ai/keys/youtube/test'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: false, kind: 'quota', error: 'quota exceeded' })
  })

  it('redacts a saved key out of a failure message', async () => {
    await auth(request(app).put('/api/ai/keys/youtube').send({ key: 'AIzaSyYoutubeSecretKeyValue00009' }))
    vi.mocked(checkYoutubeKey).mockResolvedValue({ ok: false, kind: 'auth', error: 'bad key AIzaSyYoutubeSecretKeyValue00009' })
    const res = await auth(request(app).post('/api/ai/keys/youtube/test'))
    expect(JSON.stringify(res.body)).not.toContain('SecretKeyValue')
  })

  it('does not 500 if the check itself throws', async () => {
    vi.mocked(checkYoutubeKey).mockRejectedValue(new Error('unexpected'))
    const res = await auth(request(app).post('/api/ai/keys/youtube/test'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(false)
  })
})
