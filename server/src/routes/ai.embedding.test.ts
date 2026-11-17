import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
const mockStatus = vi.fn()
vi.mock('../services/embeddingStatus', () => ({ getEmbeddingStatus: () => mockStatus() }))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
beforeEach(() => vi.clearAllMocks())

const STATUS = {
  provider: 'gemini', model: 'gemini-embedding-001', id: 'gemini:gemini-embedding-001', cloud: true, configured: true,
  usable: true, blockedReason: null, counts: { embedded: 10, needsReembed: 2, skippedPrivate: 1, pending: 0, total: 13 },
}

describe('GET /api/ai/embedding', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/ai/embedding')).status).toBe(401)
  })

  it('returns the embedding status', async () => {
    mockStatus.mockResolvedValueOnce(STATUS)
    const res = await request(app).get('/api/ai/embedding').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toEqual(STATUS)
  })

  it('returns a 500 with a plain message when the status cannot be read', async () => {
    mockStatus.mockRejectedValueOnce(new Error('db down'))
    const res = await request(app).get('/api/ai/embedding').set('Authorization', AUTH)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to read embedding status' })
  })
})
