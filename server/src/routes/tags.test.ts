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

describe('GET /api/tags', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/tags')).status).toBe(401)
  })

  it('returns tags with numeric item counts', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ name: 'thai', item_count: '12' }, { name: 'recipe', item_count: '5' }],
    } as any)
    const res = await request(app).get('/api/tags').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body[0]).toEqual({ name: 'thai', itemCount: 12 })
  })
})

describe('POST /api/items/:itemId/tags', () => {
  it('returns 400 when tags array is missing', async () => {
    const res = await request(app).post('/api/items/abc/tags').set('Authorization', AUTH).send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when the item does not exist', async () => {
    const client = (await vi.mocked(pool.connect)()) as any
    client.query.mockResolvedValueOnce({ rows: [] }) // item lookup → none
    const res = await request(app).post('/api/items/abc/tags').set('Authorization', AUTH).send({ tags: ['x'] })
    expect(res.status).toBe(404)
  })

  it('adds tags and returns the updated tag list', async () => {
    const client = (await vi.mocked(pool.connect)()) as any
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'item1' }] })  // item exists
      .mockResolvedValueOnce({ rows: [{ id: 'tag1' }] })   // upsert tag
      .mockResolvedValueOnce({ rows: [] })                 // link
      .mockResolvedValueOnce({ rows: [{ name: 'thai' }] }) // final tag list
    const res = await request(app).post('/api/items/item1/tags').set('Authorization', AUTH).send({ tags: ['Thai'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['thai'])
  })
})

describe('DELETE /api/items/:itemId/tags/:tag', () => {
  it('returns 404 when the tag name is unknown', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any) // tag lookup → none
    const res = await request(app).delete('/api/items/item1/tags/ghost').set('Authorization', AUTH)
    expect(res.status).toBe(404)
  })

  it('returns 204 when a tag link is removed', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'tag1' }] } as any) // tag lookup
      .mockResolvedValueOnce({ rowCount: 1 } as any)            // delete link
    const res = await request(app).delete('/api/items/item1/tags/thai').set('Authorization', AUTH)
    expect(res.status).toBe(204)
  })
})
