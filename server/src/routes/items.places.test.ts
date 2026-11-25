import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { createItem } from '../db/helpers'

// Saving a note with the places the user kept creates each as its own item inside the same transaction. The server does
// not trust the client's list: a name that is not in the note, or already in the library, creates nothing.
// Invented names only.
vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../services/embeddingService', async (orig) => ({ ...(await orig<typeof import('../services/embeddingService')>()), embedAndStoreItem: vi.fn() }))
vi.mock('../services/entityService', () => ({ extractAndLinkEntities: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../db/helpers', async (orig) => ({
  ...(await orig<typeof import('../db/helpers')>()),
  createItem: vi.fn(),
  fetchItem: vi.fn().mockResolvedValue({ id: 'note-1', type: 'note', structured: {} }),
  setItemCategories: vi.fn().mockResolvedValue(undefined),
  setItemTags: vi.fn().mockResolvedValue(undefined),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const TRIP = 'Pine Valley trip ideas: Old Mill Cafe, Lakeview Hotel. Eat at Maple Diner.'
const BODY = { title: 'Pine Valley trip', type: 'note', content: TRIP, source: 'manual', reviewed: false }

function mockClient(existingPlaces: unknown[] = []) {
  const client = {
    query: vi.fn().mockImplementation(async (sql: string) => {
      if (/INSERT INTO items/.test(sql)) return { rows: [{ id: 'note-1' }] }
      if (/FROM items WHERE deleted_at IS NULL AND type = 'place'/.test(sql)) return { rows: existingPlaces }
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createItem).mockImplementation(async (_c, i) => ({ id: `new-${i.title}`, type: 'place', structured: i.structured ?? {} }) as never)
})

describe('POST /api/items with kept places', () => {
  it('creates each kept place linked to the new note, in the same transaction', async () => {
    const client = mockClient()
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send({
      ...BODY,
      places: [{ name: 'Old Mill Cafe', type: 'cafe', confidence: 90 }, { name: 'Lakeview Hotel', type: 'hotel', confidence: 88 }],
      placesModel: 'gemini:gemini-x',
    })
    expect(res.status).toBe(201)
    expect(vi.mocked(createItem).mock.calls.map((c) => [c[1].title, c[1].derivedFrom])).toEqual([['Old Mill Cafe', 'note-1'], ['Lakeview Hotel', 'note-1']])
    const sqls = client.query.mock.calls.map((c) => String(c[0]))
    expect(sqls.indexOf('COMMIT')).toBeGreaterThan(-1)
    expect(sqls).not.toContain('ROLLBACK')
    expect(client.query).toHaveBeenCalledWith('UPDATE items SET extraction_model = $1 WHERE id = $2', ['gemini:gemini-x', 'new-Old Mill Cafe'])
  })

  it('ignores a place whose name is not in the note', async () => {
    mockClient()
    await request(app).post('/api/items').set('Authorization', AUTH).send({
      ...BODY,
      places: [{ name: 'Maple Diner', type: 'restaurant', confidence: 90 }, { name: 'Grand Imaginary Palace', type: 'hotel', confidence: 99 }],
    })
    expect(vi.mocked(createItem).mock.calls.map((c) => c[1].title)).toEqual(['Maple Diner'])
  })

  it('creates nothing for a place already in the library (a double submit)', async () => {
    mockClient([{ id: 'p1', name: 'Maple Diner', title: 'Maple Diner', city: null }])
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send({
      ...BODY, places: [{ name: 'Maple Diner', type: 'restaurant', confidence: 90 }],
    })
    expect(res.status).toBe(201)
    expect(createItem).not.toHaveBeenCalled()
  })

  it('saves the note alone when no places are sent', async () => {
    mockClient()
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send(BODY)
    expect(res.status).toBe(201)
    expect(createItem).not.toHaveBeenCalled()
  })

  it('rejects a malformed place list', async () => {
    mockClient()
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send({ ...BODY, places: [{ name: '', type: 'castle', confidence: 500 }] })
    expect(res.status).toBe(400)
  })
})
