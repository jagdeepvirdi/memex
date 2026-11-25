import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { fetchItem } from '../db/helpers'
import { queueRecipeExtraction } from '../services/autoRecipe'

// Saving an item hands it to the automatic recipe extraction; the save itself never waits for or depends on it.
vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../services/embeddingService', async (orig) => ({ ...(await orig<typeof import('../services/embeddingService')>()), embedAndStoreItem: vi.fn() }))
vi.mock('../services/entityService', () => ({ extractAndLinkEntities: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/autoRecipe', () => ({ queueRecipeExtraction: vi.fn().mockResolvedValue(true) }))
vi.mock('../db/helpers', async (orig) => ({
  ...(await orig<typeof import('../db/helpers')>()),
  fetchItem: vi.fn(),
  setItemCategories: vi.fn().mockResolvedValue(undefined),
  setItemTags: vi.fn().mockResolvedValue(undefined),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const SAVED = { id: 'vid-1', title: 'Garlic pasta', type: 'link', source: 'youtube', structured: { videoKind: 'recipe' }, categories: ['Food'], tags: [] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchItem).mockResolvedValue(SAVED as never)
  vi.mocked(pool.connect).mockResolvedValue({
    query: vi.fn().mockImplementation(async (sql: string) => (/INSERT INTO items/.test(sql) ? { rows: [{ id: 'vid-1' }] } : { rows: [] })),
    release: vi.fn(),
  } as never)
})

describe('POST /api/items: automatic recipe extraction', () => {
  it('hands the saved item to the extraction queue', async () => {
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send({
      title: 'Garlic pasta', type: 'link', content: 'transcript', source: 'youtube', structured: { videoKind: 'recipe' }, reviewed: false,
    })
    expect(res.status).toBe(201)
    expect(queueRecipeExtraction).toHaveBeenCalledWith(SAVED)
  })

  it('still saves when the queue cannot be used', async () => {
    vi.mocked(queueRecipeExtraction).mockRejectedValueOnce(new Error('queue broke'))
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send({
      title: 'Garlic pasta', type: 'link', content: 'transcript', source: 'youtube', reviewed: false,
    })
    expect(res.status).toBe(201)
  })
})
