import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { embedQuery } from '../services/embedder'
import { setActiveEmbedding, buildEmbedding } from '../services/embeddingConfig'

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

describe('GET /api/search/graph — model filter and thresholds', () => {
  afterEach(() => setActiveEmbedding(null))

  it('only links items whose vectors come from the active model, at the graph threshold of that model', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app).get('/api/search/graph').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ nodes: [], links: [], semanticLinks: true })
    const [nodes, links] = vi.mocked(pool.query).mock.calls
    expect(String(nodes[0])).toMatch(/embedding_model = \$2/)
    expect(nodes[1]).toEqual([100, 'ollama:nomic-embed-text'])
    expect(String(links[0])).toMatch(/embedding_model = \$2/)
    expect(String(links[0])).toMatch(/> \$3/)
    expect(links[1]).toEqual([100, 'ollama:nomic-embed-text', 0.85]) // nomic's tuned graph threshold
  })

  it('uses the threshold of the model that is active, not a fixed one', async () => {
    setActiveEmbedding(buildEmbedding('gemini'))
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any).mockResolvedValueOnce({ rows: [] } as any)
    await request(app).get('/api/search/graph').set('Authorization', AUTH)
    expect(vi.mocked(pool.query).mock.calls[1][1]).toEqual([100, 'gemini:gemini-embedding-001', 0.8])
  })

  it('draws no semantic links for a model nobody has measured, but still returns the nodes', async () => {
    setActiveEmbedding(buildEmbedding('openai'))
    const nodes = [{ id: 'a', title: 'A', type: 'note' }]
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: nodes } as any)
    const res = await request(app).get('/api/search/graph').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ nodes, links: [], semanticLinks: false })
    expect(pool.query).toHaveBeenCalledTimes(1) // the expensive pairwise query is not even run
  })
})
