import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/embedder', () => ({ embedItem: vi.fn(), embedQuery: vi.fn() }))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
beforeEach(() => vi.clearAllMocks())

const RELATED = {
  id: 'r1', title: 'Similar', type: 'note', content: 'x', structured: {}, source: 'manual', source_url: null,
  encrypted: false, reviewed: false, created_at: new Date(), updated_at: new Date(), categories: [], tags: [],
}

describe('GET /api/items/:id/related — embedding model', () => {
  it('compares only against vectors from the active model', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ embedding: '[0.1,0.2]', embedding_model: 'ollama:nomic-embed-text' }] } as any)
      .mockResolvedValueOnce({ rows: [RELATED] } as any)
    const res = await request(app).get('/api/items/i1/related').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    const [sql, params] = vi.mocked(pool.query).mock.calls[1]
    expect(String(sql)).toMatch(/i\.embedding_model = \$3/)
    expect(params).toEqual(['i1', JSON.stringify('[0.1,0.2]'), 'ollama:nomic-embed-text'])
  })

  it('returns nothing, without a second query, when this item was embedded by a different model', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ embedding: '[0.1,0.2]', embedding_model: 'gemini:gemini-embedding-001' }] } as any)
    const res = await request(app).get('/api/items/i1/related').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expect(pool.query).toHaveBeenCalledTimes(1)
  })

  it('returns nothing for an item without a vector', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ embedding: null, embedding_model: null }] } as any)
    const res = await request(app).get('/api/items/i1/related').set('Authorization', AUTH)
    expect(res.body).toEqual([])
    expect(pool.query).toHaveBeenCalledTimes(1)
  })
})
