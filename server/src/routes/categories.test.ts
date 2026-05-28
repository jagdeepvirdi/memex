import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
// resetAllMocks clears mockResolvedValueOnce queues; clearAllMocks does not
beforeEach(() => vi.resetAllMocks())

// ── buildTree (tested via GET /api/categories) ────────────────────────────────

describe('GET /api/categories — tree structure', () => {
  it('returns root categories with no children when all rows have null parent_id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { id: 'c1', name: 'Food',   parent_id: null, item_count: '3' },
        { id: 'c2', name: 'Travel', parent_id: null, item_count: '1' },
      ],
    } as any)

    const res = await request(app).get('/api/categories').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].children).toEqual([])
    expect(res.body[0].itemCount).toBe(3)
  })

  it('nests child categories under their parent', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { id: 'c1', name: 'Food',   parent_id: null, item_count: '0' },
        { id: 'c2', name: 'Savory', parent_id: 'c1', item_count: '2' },
        { id: 'c3', name: 'Indian', parent_id: 'c2', item_count: '2' },
      ],
    } as any)

    const res = await request(app).get('/api/categories').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)             // only Food at root
    expect(res.body[0].name).toBe('Food')
    expect(res.body[0].children[0].name).toBe('Savory')
    expect(res.body[0].children[0].children[0].name).toBe('Indian')
  })

  it('returns empty array when no categories exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app).get('/api/categories').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('orphan children (parent_id not in result) appear at root level', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { id: 'c2', name: 'Savory', parent_id: 'missing-parent', item_count: '0' },
      ],
    } as any)
    const res = await request(app).get('/api/categories').set('Authorization', AUTH)
    // Not nested because parent not found — appears at root as an orphan
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0) // orphan is dropped (parent map miss)
  })
})

// ── POST /api/categories ──────────────────────────────────────────────────────

describe('POST /api/categories', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', AUTH)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', AUTH)
      .send({ name: '' })
    expect(res.status).toBe(400)
  })

  it('creates a root category and returns 201', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'c-new' }] } as any)  // INSERT
      .mockResolvedValueOnce({ rows: [{ id: 'c-new', name: 'Travel', parent_id: null, item_count: '0' }] } as any) // SELECT

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', AUTH)
      .send({ name: 'Travel' })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Travel')
    expect(res.body.parentId).toBeNull()
    expect(res.body.itemCount).toBe(0)
  })

  it('returns 404 when parentId does not exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any) // parent check fails

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', AUTH)
      .send({ name: 'Subcategory', parentId: '00000000-0000-0000-0000-000000000001' })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/parent/i)
  })
})

// ── PUT /api/categories/:id ───────────────────────────────────────────────────

describe('PUT /api/categories/:id', () => {
  it('returns 400 when body has nothing to update', async () => {
    const res = await request(app)
      .put('/api/categories/c1')
      .set('Authorization', AUTH)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when category does not exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app)
      .put('/api/categories/ghost')
      .set('Authorization', AUTH)
      .send({ name: 'New Name' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when parentId equals its own id (self-parent)', async () => {
    const CAT_ID = '00000000-0000-0000-0000-000000000001'
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: CAT_ID }] } as any)
    const res = await request(app)
      .put(`/api/categories/${CAT_ID}`)
      .set('Authorization', AUTH)
      .send({ parentId: CAT_ID })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/own parent/i)
  })

  it('renames a category and returns 200', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] } as any)  // SELECT existing
      .mockResolvedValueOnce({ rows: [] } as any)               // UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Cuisine', parent_id: null, item_count: '5' }] } as any) // SELECT updated

    const res = await request(app)
      .put('/api/categories/c1')
      .set('Authorization', AUTH)
      .send({ name: 'Cuisine' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Cuisine')
    expect(res.body.itemCount).toBe(5)
  })
})

// ── DELETE /api/categories/:id ────────────────────────────────────────────────

describe('DELETE /api/categories/:id', () => {
  it('returns 409 when category has assigned items', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ count: '3' }] } as any) // items count > 0
    const res = await request(app)
      .delete('/api/categories/c1')
      .set('Authorization', AUTH)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/move them/i)
  })

  it('returns 409 when category has child categories', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any) // no items
      .mockResolvedValueOnce({ rows: [{ count: '2' }] } as any) // has children
    const res = await request(app)
      .delete('/api/categories/c1')
      .set('Authorization', AUTH)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/child/i)
  })

  it('returns 404 when category does not exist', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)  // no items
      .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)  // no children
      .mockResolvedValueOnce({ rowCount: 0 } as any)             // DELETE — not found
    const res = await request(app)
      .delete('/api/categories/ghost')
      .set('Authorization', AUTH)
    expect(res.status).toBe(404)
  })

  it('returns 204 on successful delete', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)  // no items
      .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)  // no children
      .mockResolvedValueOnce({ rowCount: 1 } as any)             // DELETE
    const res = await request(app)
      .delete('/api/categories/c1')
      .set('Authorization', AUTH)
    expect(res.status).toBe(204)
  })
})
