import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => {
  const client = { query: vi.fn(), release: vi.fn() }
  return { pool: { query: vi.fn(), connect: vi.fn().mockResolvedValue(client) } }
})

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
beforeEach(() => vi.clearAllMocks())

describe('GET /api/settings', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/settings')
    expect(res.status).toBe(401)
  })

  it('returns settings as a key→value map', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ key: 'ai_model', value: 'llama3.2' }, { key: 'use_claude', value: false }],
    } as any)
    const res = await request(app).get('/api/settings').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.ai_model).toBe('llama3.2')
    expect(res.body.use_claude).toBe(false)
  })
})

describe('PUT /api/settings', () => {
  it('upserts each provided key within a transaction', async () => {
    const client = (await vi.mocked(pool.connect)()) as any
    client.query.mockResolvedValue({ rows: [] })
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', AUTH)
      .send({ ai_model: 'gemma3:4b', strict_local_mode: true })
    expect(res.status).toBe(200)
    const sqls = client.query.mock.calls.map((c: any[]) => c[0])
    expect(sqls).toContain('BEGIN')
    expect(sqls).toContain('COMMIT')
  })
})

describe('POST /api/settings/bookmarklet-key', () => {
  it('generates and returns a hex key', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app).post('/api/settings/bookmarklet-key').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.key).toMatch(/^[0-9a-f]{48}$/)
  })

  it('persists the key to the settings table', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    await request(app).post('/api/settings/bookmarklet-key').set('Authorization', AUTH)
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string
    expect(sql).toMatch(/bookmarklet_key/)
    expect(sql).toMatch(/ON CONFLICT/i)
  })
})
