import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index'
import { pool } from '../db/client'

vi.mock('../db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

beforeEach(() => vi.clearAllMocks())

const SHARED_ROW = {
  id: 'i1', title: 'Bangkok Restaurants', type: 'place',
  content: 'Thai Garden, Khao Yai', structured: { summary: 'Places to eat' },
  source: 'keep', source_url: null, encrypted: false, reviewed: true,
  created_at: new Date(), updated_at: new Date(), confidence: 90,
  remind_at: null, public_token: 'a'.repeat(40), categories: ['Travel'], tags: ['food'],
}

describe('GET /api/share/:token (public)', () => {
  it('does NOT require authentication', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [SHARED_ROW] } as any)
    const res = await request(app).get(`/api/share/${'a'.repeat(40)}`) // no Authorization header
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Bangkok Restaurants')
  })

  it('returns the item for a valid token', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [SHARED_ROW] } as any)
    const res = await request(app).get(`/api/share/${'a'.repeat(40)}`)
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('place')
    expect(res.body.categories).toEqual(['Travel'])
  })

  it('returns 400 for a too-short token', async () => {
    const res = await request(app).get('/api/share/short')
    expect(res.status).toBe(400)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('returns 404 when the token matches nothing (revoked or never shared)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    const res = await request(app).get(`/api/share/${'b'.repeat(40)}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found|revoked/i)
  })

  it('returns 500 gracefully on a DB error', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'))
    const res = await request(app).get(`/api/share/${'c'.repeat(40)}`)
    expect(res.status).toBe(500)
  })

  it('only queries non-deleted, non-encrypted items', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any)
    await request(app).get(`/api/share/${'d'.repeat(40)}`)
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string
    expect(sql).toMatch(/deleted_at IS NULL/i)
    expect(sql).toMatch(/encrypted\s*=\s*FALSE/i)
  })
})
