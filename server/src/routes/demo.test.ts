import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
const client = { query: vi.fn(), release: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  client.query.mockReset()
})

describe('/api/demo', () => {
  it('needs a login', async () => {
    expect((await request(app).get('/api/demo')).status).toBe(401)
    expect((await request(app).post('/api/demo')).status).toBe(401)
    expect((await request(app).delete('/api/demo')).status).toBe(401)
  })

  it('reports how many sample items are loaded', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ n: '37' }] } as never)
    const res = await request(app).get('/api/demo').set('Authorization', AUTH)
    expect(res.body).toEqual({ items: 37 })
  })

  it('refuses to load twice, with a sentence that says what to do', async () => {
    client.query.mockImplementation(async (sql: string) => (/count\(\*\)/.test(sql) ? { rows: [{ n: '5' }] } : { rows: [] }))
    const res = await request(app).post('/api/demo').set('Authorization', AUTH)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Clear it first/)
    expect(client.query.mock.calls.map(c => String(c[0]))).not.toContain('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and answers 500 when a load fails half way', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: '0' }] }
      if (/INSERT INTO items/.test(sql)) throw new Error('disk full')
      return { rows: [] }
    })
    const res = await request(app).post('/api/demo').set('Authorization', AUTH)
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Could not load the sample data')
    const sqls = client.query.mock.calls.map(c => String(c[0]))
    expect(sqls).toContain('ROLLBACK')
    expect(sqls).not.toContain('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('clears only sample rows and reports what it removed', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/DELETE FROM items/.test(sql)) return { rowCount: 40 }
      if (/DELETE FROM entities/.test(sql)) return { rowCount: 9 }
      if (/DELETE FROM tags/.test(sql)) return { rowCount: 20 }
      return { rows: [], rowCount: 0 }
    })
    const res = await request(app).delete('/api/demo').set('Authorization', AUTH)
    expect(res.body).toEqual({ items: 40, entities: 9, tags: 20 })
    const sqls = client.query.mock.calls.map(c => String(c[0]))
    expect(sqls.find(s => /DELETE FROM items/.test(s))).toContain("structured->>'demo' = 'true'")
    expect(sqls).toContain('COMMIT')
  })

  it('rolls back a failed clear', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/DELETE FROM items/.test(sql)) throw new Error('locked')
      return { rows: [] }
    })
    const res = await request(app).delete('/api/demo').set('Authorization', AUTH)
    expect(res.status).toBe(500)
    expect(client.query.mock.calls.map(c => String(c[0]))).toContain('ROLLBACK')
  })
})
