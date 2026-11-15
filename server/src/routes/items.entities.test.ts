import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/classifier', () => ({ classify: vi.fn(), mapToCategories: vi.fn().mockReturnValue([]) }))
vi.mock('../services/embedder', () => ({ embedItem: vi.fn().mockResolvedValue([0.1]) }))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const get = () => request(app).get('/api/items/item-1/entities').set('Authorization', AUTH)
const q = vi.mocked(pool.query)

beforeEach(() => vi.resetAllMocks())

describe('GET /api/items/:id/entities', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/items/item-1/entities')).status).toBe(401)
  })

  it('returns an empty list, with one query, when the item has no links', async () => {
    q.mockResolvedValueOnce({ rows: [] } as never)
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expect(q).toHaveBeenCalledTimes(1)
    expect(q.mock.calls[0][1]).toEqual(['item-1'])
  })

  it('returns each entity with its roles, how many other items share it, and a sample of them', async () => {
    q.mockResolvedValueOnce({
      rows: [
        { id: 'e1', name: '@someone', type: 'person', role: 'creator' },
        { id: 'e2', name: 'anthropics', type: 'organization', role: 'owner' },
        { id: 'e3', name: 'anthropics/claude-code', type: 'other', role: 'repo' },
      ],
    } as never)
    q.mockResolvedValueOnce({
      rows: [
        { entity_id: 'e1', id: 'a', title: 'Other repo', type: 'link', total: '3' },
        { entity_id: 'e1', id: 'b', title: 'A prompt', type: 'link', total: '3' },
        { entity_id: 'e2', id: 'c', title: 'Cookbook', type: 'link', total: '1' },
      ],
    } as never)

    const res = await get()

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { id: 'e1', name: '@someone', type: 'person', roles: ['creator'], total: 3, others: [
        { id: 'a', title: 'Other repo', type: 'link' }, { id: 'b', title: 'A prompt', type: 'link' },
      ] },
      { id: 'e2', name: 'anthropics', type: 'organization', roles: ['owner'], total: 1, others: [{ id: 'c', title: 'Cookbook', type: 'link' }] },
      { id: 'e3', name: 'anthropics/claude-code', type: 'other', roles: ['repo'], total: 0, others: [] },
    ])
  })

  it('merges several roles for the same entity into one row', async () => {
    q.mockResolvedValueOnce({
      rows: [
        { id: 'p1', name: 'Clint Eastwood', type: 'person', role: 'director' },
        { id: 'p1', name: 'Clint Eastwood', type: 'person', role: 'cast' },
        { id: 'p1', name: 'Clint Eastwood', type: 'person', role: 'cast' },
      ],
    } as never)
    q.mockResolvedValueOnce({ rows: [] } as never)
    const res = await get()
    expect(res.body).toHaveLength(1)
    expect(res.body[0].roles).toEqual(['director', 'cast'])
  })

  it('sorts entities that connect to other items first, then by name', async () => {
    q.mockResolvedValueOnce({
      rows: [
        { id: 'z', name: 'Zed', type: 'person', role: 'creator' },
        { id: 'a', name: 'Alpha', type: 'person', role: 'creator' },
        { id: 'm', name: 'Mid', type: 'person', role: 'creator' },
      ],
    } as never)
    q.mockResolvedValueOnce({ rows: [{ entity_id: 'm', id: 'x', title: 'X', type: 'note', total: '2' }] } as never)
    const res = await get()
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(['Mid', 'Alpha', 'Zed'])
  })

  it('only counts other, live, non-encrypted items, once each, capped at five per entity', async () => {
    q.mockResolvedValueOnce({ rows: [{ id: 'e1', name: 'n', type: 'person', role: 'creator' }] } as never)
    q.mockResolvedValueOnce({ rows: [] } as never)
    await get()

    const [linksSql] = q.mock.calls[0]
    expect(linksSql).toMatch(/i\.deleted_at IS NULL AND i\.encrypted = false/) // the item itself must be live

    const [sharedSql, params] = q.mock.calls[1]
    expect(sharedSql).toMatch(/SELECT DISTINCT entity_id, item_id/)
    expect(sharedSql).toMatch(/item_id <> \$2/)
    expect(sharedSql).toMatch(/i\.deleted_at IS NULL AND i\.encrypted = false/)
    expect(sharedSql).toMatch(/ORDER BY i\.created_at DESC/)
    expect(sharedSql).toMatch(/rn <= \$3/)
    expect(params).toEqual([['e1'], 'item-1', 5])
  })

  it('500s when a query fails', async () => {
    q.mockRejectedValueOnce(new Error('db'))
    expect((await get()).status).toBe(500)
  })

  it('is not shadowed by /:id', async () => {
    q.mockResolvedValueOnce({ rows: [] } as never)
    const res = await get()
    expect(Array.isArray(res.body)).toBe(true)
  })
})
