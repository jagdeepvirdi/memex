import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { embedQuery } from '../services/embedder'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/embedder', () => ({
  embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedItem: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3])
})

const ROW = {
  id: 'i1', title: 'Dog Friendly Bangkok', type: 'link', content: 'Kanchanaburi', structured: {}, source: 'keep',
  source_url: null, encrypted: false, reviewed: true, created_at: new Date(), updated_at: new Date(), categories: [], tags: [],
}

describe('POST /api/search — keyword fallback', () => {
  it('reports semantic:true when the query was embedded', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as any)
    const res = await request(app).post('/api/search').set('Authorization', AUTH).send({ query: 'dogs' })
    expect(res.status).toBe(200)
    expect(res.body.semantic).toBe(true)
  })

  it('answers with keyword results and semantic:false instead of a 500 when embedding fails', async () => {
    vi.mocked(embedQuery).mockRejectedValueOnce(new Error('embedding provider down'))
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as any)
    const res = await request(app).post('/api/search').set('Authorization', AUTH).send({ query: 'dogs' })
    expect(res.status).toBe(200)
    expect(res.body.semantic).toBe(false)
    expect(res.body.items).toHaveLength(1)
    expect(String(vi.mocked(pool.query).mock.calls[0][0])).not.toMatch(/::vector/)
  })
})

describe('GET /api/search/graph — model filter', () => {
  it('only links items whose vectors come from the active model', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app).get('/api/search/graph').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    for (const call of vi.mocked(pool.query).mock.calls) {
      expect(String(call[0])).toMatch(/embedding_model = \$2/)
      expect(call[1]).toEqual([100, 'ollama:nomic-embed-text'])
    }
  })
})
