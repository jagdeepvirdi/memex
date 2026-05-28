import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

// ── helpers ───────────────────────────────────────────────────────────────────

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const VAULT_ITEM = {
  id: 'v-1',
  service: 'GitHub',
  url: 'https://github.com',
  username: 'jagdeep',
  ciphertext: 'abc123encrypted',
  iv: 'initvector',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

beforeEach(() => vi.clearAllMocks())

// ── Auth guard ────────────────────────────────────────────────────────────────

describe('Vault auth guard', () => {
  it('GET /api/vault returns 401 without token', async () => {
    const res = await request(app).get('/api/vault')
    expect(res.status).toBe(401)
  })

  it('POST /api/vault returns 401 without token', async () => {
    const res = await request(app).post('/api/vault').send(VAULT_ITEM)
    expect(res.status).toBe(401)
  })
})

// ── GET /api/vault/salt ───────────────────────────────────────────────────────

describe('GET /api/vault/salt', () => {
  it('returns existing salt', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ salt: 'abc123salt==' }] } as any)

    const res = await request(app).get('/api/vault/salt').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.salt).toBe('abc123salt==')
  })

  it('generates and returns a new salt when none exists', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as any)       // SELECT — not found
      .mockResolvedValueOnce({ rows: [] } as any)       // INSERT
      .mockResolvedValueOnce({ rows: [{ salt: 'newsalt==' }] } as any) // SELECT again

    const res = await request(app).get('/api/vault/salt').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.salt).toBeDefined()
  })
})

// ── GET /api/vault ────────────────────────────────────────────────────────────

describe('GET /api/vault', () => {
  it('returns an array of vault items', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [VAULT_ITEM] } as any)

    const res = await request(app).get('/api/vault').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].service).toBe('GitHub')
  })

  it('returns empty array when vault is empty', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app).get('/api/vault').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

// ── POST /api/vault ───────────────────────────────────────────────────────────

describe('POST /api/vault', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/vault')
      .set('Authorization', AUTH)
      .send({ service: 'GitHub' }) // missing ciphertext and iv

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/ciphertext/i)
  })

  it('creates and returns a vault item', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [VAULT_ITEM] } as any)

    const res = await request(app)
      .post('/api/vault')
      .set('Authorization', AUTH)
      .send({
        service: 'GitHub',
        url: 'https://github.com',
        username: 'jagdeep',
        ciphertext: 'abc123encrypted',
        iv: 'initvector',
      })

    expect(res.status).toBe(201)
    expect(res.body.service).toBe('GitHub')
    expect(res.body.ciphertext).toBe('abc123encrypted')
  })
})

// ── PUT /api/vault/:id ────────────────────────────────────────────────────────

describe('PUT /api/vault/:id', () => {
  it('returns 200 with updated item', async () => {
    const updated = { ...VAULT_ITEM, username: 'newuser' }
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [updated] } as any)

    const res = await request(app)
      .put('/api/vault/v-1')
      .set('Authorization', AUTH)
      .send({ username: 'newuser' })

    expect(res.status).toBe(200)
    expect(res.body.username).toBe('newuser')
  })

  it('returns 404 when vault item is not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app)
      .put('/api/vault/ghost')
      .set('Authorization', AUTH)
      .send({ username: 'x' })

    expect(res.status).toBe(404)
  })
})

// ── DELETE /api/vault/:id ─────────────────────────────────────────────────────

describe('DELETE /api/vault/:id', () => {
  it('returns 204 on successful delete', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1 } as any)

    const res = await request(app)
      .delete('/api/vault/v-1')
      .set('Authorization', AUTH)

    expect(res.status).toBe(204)
  })

  it('returns 404 when vault item does not exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 0 } as any)

    const res = await request(app)
      .delete('/api/vault/ghost')
      .set('Authorization', AUTH)

    expect(res.status).toBe(404)
  })
})
