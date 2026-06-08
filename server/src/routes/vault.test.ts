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

beforeEach(() => {
  vi.clearAllMocks()
  // Default client for paths that call pool.connect() before early-return validation
  vi.mocked(pool.connect).mockResolvedValue({
    query: vi.fn().mockResolvedValue({}),
    release: vi.fn(),
  } as any)
})

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

// ── GET /api/vault/status ─────────────────────────────────────────────────────

describe('GET /api/vault/status', () => {
  it('returns hasSetup:false when no vault_config row exists', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)

    const res = await request(app).get('/api/vault/status').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body.hasSetup).toBe(false)
  })

  it('returns salt + verifier when vault is fully set up', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ salt: 'abc==', verifier: 'enc123', verifier_iv: 'iv456' }],
    } as any)

    const res = await request(app).get('/api/vault/status').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ hasSetup: true, salt: 'abc==', verifier: 'enc123', verifierIv: 'iv456' })
  })

  it('returns null verifier when salt exists but verifier not yet set', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ salt: 'abc==', verifier: null, verifier_iv: null }],
    } as any)

    const res = await request(app).get('/api/vault/status').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ hasSetup: true, verifier: null, verifierIv: null })
  })
})

// ── POST /api/vault/setup ─────────────────────────────────────────────────────

describe('POST /api/vault/setup', () => {
  it('returns 400 when verifier fields are missing', async () => {
    const res = await request(app)
      .post('/api/vault/setup')
      .set('Authorization', AUTH)
      .send({ verifier: 'enc123' }) // missing verifierIv

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/verifierIv/i)
  })

  it('returns 400 when no vault_config row exists to update', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 0 } as any)

    const res = await request(app)
      .post('/api/vault/setup')
      .set('Authorization', AUTH)
      .send({ verifier: 'enc123', verifierIv: 'iv456' })

    expect(res.status).toBe(400)
  })

  it('stores verifier and returns success', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1 } as any)

    const res = await request(app)
      .post('/api/vault/setup')
      .set('Authorization', AUTH)
      .send({ verifier: 'enc123', verifierIv: 'iv456' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── PUT /api/vault/rekey ──────────────────────────────────────────────────────

function mockClient(overrides: Record<string, any> = {}) {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    release: vi.fn(),
    ...overrides,
  }
  vi.mocked(pool.connect).mockResolvedValueOnce(client as any)
  return client
}

describe('PUT /api/vault/rekey', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .put('/api/vault/rekey')
      .set('Authorization', AUTH)
      .send({ salt: 'newsalt==' }) // missing verifier, verifierIv, items

    expect(res.status).toBe(400)
  })

  it('commits transaction and returns success', async () => {
    const client = mockClient()

    const res = await request(app)
      .put('/api/vault/rekey')
      .set('Authorization', AUTH)
      .send({
        salt: 'newsalt==',
        verifier: 'newenc',
        verifierIv: 'newiv',
        items: [{ id: 'v-1', ciphertext: 'newcipher', iv: 'newiv2' }],
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // BEGIN + UPDATE vault_config + UPDATE vault_items (×1) + COMMIT
    expect(client.query).toHaveBeenCalledWith('BEGIN')
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and returns 500 on DB error', async () => {
    const client = mockClient({
      query: vi.fn()
        .mockResolvedValueOnce({})  // BEGIN
        .mockRejectedValueOnce(new Error('db error')),
    })

    const res = await request(app)
      .put('/api/vault/rekey')
      .set('Authorization', AUTH)
      .send({ salt: 's', verifier: 'v', verifierIv: 'iv', items: [] })

    expect(res.status).toBe(500)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})

// ── POST /api/vault/reset ─────────────────────────────────────────────────────

describe('POST /api/vault/reset', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/vault/reset')
    expect(res.status).toBe(401)
  })

  it('resets without password when vault has no verifier set up', async () => {
    // pool.query for SELECT verifier (not via client), then client handles BEGIN/DELETE/COMMIT
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any) // no vault_config row
    const client = mockClient()

    const res = await request(app)
      .post('/api/vault/reset')
      .set('Authorization', AUTH)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(client.query).toHaveBeenCalledWith('BEGIN')
    expect(client.query).toHaveBeenCalledWith('COMMIT')
  })

  it('returns 400 when vault has a verifier but no sentinel provided', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ verifier: 'enc-sentinel' }],
    } as any)
    mockClient()

    const res = await request(app)
      .post('/api/vault/reset')
      .set('Authorization', AUTH)
      .send({}) // no verifiedSentinel

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/verification required/i)
  })

  it('returns 400 when verifiedSentinel is wrong', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ verifier: 'enc-sentinel' }],
    } as any)
    mockClient()

    const res = await request(app)
      .post('/api/vault/reset')
      .set('Authorization', AUTH)
      .send({ verifiedSentinel: 'wrong-value' })

    expect(res.status).toBe(400)
  })

  it('resets when verifiedSentinel is correct', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ verifier: 'enc-sentinel' }],
    } as any)
    const client = mockClient()

    const res = await request(app)
      .post('/api/vault/reset')
      .set('Authorization', AUTH)
      .send({ verifiedSentinel: 'memex-vault-v1' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(client.query).toHaveBeenCalledWith('BEGIN')
    expect(client.query).toHaveBeenCalledWith('COMMIT')
  })

  it('rolls back and returns 500 on DB error', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any) // no verifier
    const client = mockClient({
      query: vi.fn()
        .mockResolvedValueOnce({})  // BEGIN
        .mockRejectedValueOnce(new Error('db error')),
    })

    const res = await request(app)
      .post('/api/vault/reset')
      .set('Authorization', AUTH)

    expect(res.status).toBe(500)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})

// ── POST /api/vault/migrate/:itemId ──────────────────────────────────────────

describe('POST /api/vault/migrate/:itemId', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/vault/migrate/item-1')
      .set('Authorization', AUTH)
      .send({ service: 'GitHub' }) // missing ciphertext and iv

    expect(res.status).toBe(400)
  })

  it('returns 404 when the source item does not exist', async () => {
    const client = mockClient({
      query: vi.fn()
        .mockResolvedValueOnce({})                    // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any),  // SELECT item — not found
    })

    const res = await request(app)
      .post('/api/vault/migrate/ghost')
      .set('Authorization', AUTH)
      .send({ service: 'GitHub', ciphertext: 'enc', iv: 'iv' })

    expect(res.status).toBe(404)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })

  it('inserts vault item and hard-deletes source item on success', async () => {
    const client = mockClient({
      query: vi.fn()
        .mockResolvedValueOnce({})                                        // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] } as any)      // SELECT item
        .mockResolvedValueOnce({ rows: [{ id: 'v-new' }] } as any)       // INSERT vault_items
        .mockResolvedValueOnce({})                                        // DELETE items
        .mockResolvedValueOnce({}),                                       // COMMIT
    })

    const res = await request(app)
      .post('/api/vault/migrate/item-1')
      .set('Authorization', AUTH)
      .send({ service: 'GitHub', url: 'https://github.com', username: 'u', ciphertext: 'enc', iv: 'iv' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('v-new')
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })
})
