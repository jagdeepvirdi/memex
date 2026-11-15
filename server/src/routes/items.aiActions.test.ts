import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'

// Runs before the app (and its rate limiter) is imported; the real default is 10/min.
vi.hoisted(() => { process.env.AI_ACTION_RATE_LIMIT_MAX = '1000' })

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/classifier', () => ({
  classify: vi.fn(),
  mapToCategories: vi.fn().mockReturnValue(['Food', 'Savory']),
}))
vi.mock('../services/embedder', () => ({ embedItem: vi.fn().mockResolvedValue([0.1]) }))
vi.mock('../services/explainService', async orig => ({
  ...(await orig<typeof import('../services/explainService')>()),
  explainItem: vi.fn(),
}))
vi.mock('../services/recipeExtractor', async orig => ({
  ...(await orig<typeof import('../services/recipeExtractor')>()),
  extractRecipe: vi.fn(),
}))

import { explainItem, ExplainParseError } from '../services/explainService'
import { extractRecipe } from '../services/recipeExtractor'
import { NoSourceTextError } from '../services/itemSource'
import { AiProviderError } from '../services/ai'

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const ROW = {
  id: 'vid-1', title: 'Cook with Joe', content: VIDEO, source: 'youtube', source_url: VIDEO,
  structured: {}, type: 'link', encrypted: false, categories: ['Links'], tags: [],
}
const FULL_ITEM = {
  id: 'vid-1', title: 'Cook with Joe', type: 'link', content: VIDEO, structured: {}, source: 'youtube',
  source_url: VIDEO, encrypted: false, reviewed: false, created_at: new Date(), updated_at: new Date(),
  categories: [], tags: [],
}
const EXPLANATION = {
  summary: 's', keyPoints: ['k'], steps: [], takeaways: ['t'], model: 'ollama:llama3.2',
  generatedAt: '2026-11-15T00:00:00.000Z', basis: 'transcript', truncated: false,
}
const FOUND = {
  found: true as const, title: 'Aglio e Olio', confidence: 80, model: 'ollama:llama3.2',
  recipe: { ingredients: ['pasta', 'garlic'], steps: ['boil', 'fry'] },
}

/** pool.connect() client whose queries answer in order. */
function mockClient(answers: Array<{ rows: unknown[] }> = []) {
  let i = 0
  const client = { query: vi.fn().mockImplementation(() => Promise.resolve(answers[i++] ?? { rows: [] })), release: vi.fn() }
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  return client
}

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
  vi.mocked(pool.connect).mockReset()
  vi.mocked(explainItem).mockReset()
  vi.mocked(extractRecipe).mockReset()
})

describe('POST /api/items/:id/explain', () => {
  it('requires auth', async () => {
    expect((await request(app).post('/api/items/vid-1/explain')).status).toBe(401)
  })

  it('404s for a missing item', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never)
    const res = await request(app).post('/api/items/nope/explain').set('Authorization', AUTH)
    expect(res.status).toBe(404)
  })

  it('400s on an invalid body', async () => {
    const res = await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH).send({ provider: 'gpt' })
    expect(res.status).toBe(400)
  })

  it('refuses encrypted items', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...ROW, encrypted: true }] } as never)
    const res = await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH)
    expect(res.status).toBe(400)
    expect(explainItem).not.toHaveBeenCalled()
  })

  it('409s when an explanation exists, unless force is set', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ ...ROW, structured: { explanation: EXPLANATION } }] } as never)
    const res = await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH)
    expect(res.status).toBe(409)
    expect(explainItem).not.toHaveBeenCalled()

    vi.mocked(explainItem).mockResolvedValue(EXPLANATION as never)
    mockClient([{ rows: [FULL_ITEM] }])
    const forced = await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH).send({ force: true })
    expect(forced.status).toBe(200)
  })

  it('explains, stores under structured.explanation with extraction_model, and returns item + explanation', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [ROW] } as never) // load
      .mockResolvedValueOnce({ rows: [] } as never) // update
    vi.mocked(explainItem).mockResolvedValue(EXPLANATION as never)
    mockClient([{ rows: [FULL_ITEM] }])

    const res = await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH).send({ provider: 'claude' })

    expect(res.status).toBe(200)
    expect(res.body.explanation.summary).toBe('s')
    expect(res.body.item.id).toBe('vid-1')
    expect(explainItem).toHaveBeenCalledWith(
      { title: 'Cook with Joe', content: VIDEO, sourceUrl: VIDEO },
      { provider: 'claude', cloudSafe: true },
    )
    const [sql, params] = vi.mocked(pool.query).mock.calls[1]
    expect(sql).toContain("jsonb_set(COALESCE(structured, '{}'::jsonb), '{explanation}'")
    expect(params).toEqual([JSON.stringify(EXPLANATION), 'ollama:llama3.2', 'vid-1'])
  })

  it('pins private items to local (cloudSafe=false)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...ROW, tags: ['private'] }] } as never).mockResolvedValueOnce({ rows: [] } as never)
    vi.mocked(explainItem).mockResolvedValue(EXPLANATION as never)
    mockClient([{ rows: [FULL_ITEM] }])
    await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH)
    expect(vi.mocked(explainItem).mock.calls[0][1]).toMatchObject({ cloudSafe: false })
  })

  it.each([
    ['no transcript', new NoSourceTextError('No transcript'), 422],
    ['unparseable AI answer', new ExplainParseError(), 502],
    ['blocked provider', new AiProviderError('claude', 'blocked', 'Cannot use claude: Strict Local Mode is on'), 409],
    ['rate limit', new AiProviderError('gemini', 'rate_limit', 'slow'), 429],
    ['timeout', new AiProviderError('claude', 'timeout', 'slow'), 504],
    ['provider down', new AiProviderError('ollama', 'unavailable', 'down'), 502],
    ['strict local scrape block', new Error('Strict Local Mode is enabled. External URL scraping is blocked.'), 409],
  ])('maps %s to %i', async (_name, err, status) => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never)
    vi.mocked(explainItem).mockRejectedValue(err)
    const res = await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH)
    expect(res.status).toBe(status)
    expect(res.body.error).toBeTruthy()
  })

  it('500s on an unexpected error', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never)
    vi.mocked(explainItem).mockRejectedValue(new Error('db exploded'))
    const res = await request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH)
    expect(res.status).toBe(500)
  })
})

describe('GET /api/items/:id/derived', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/items/vid-1/derived')).status).toBe(401)
  })

  it('lists live items whose derived_from is this item', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ ...FULL_ITEM, id: 'rec-1', type: 'recipe', derived_from: 'vid-1' }],
    } as never)
    const res = await request(app).get('/api/items/vid-1/derived').set('Authorization', AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ id: 'rec-1', type: 'recipe', derivedFrom: 'vid-1' })
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(sql).toContain('i.derived_from = $1')
    expect(sql).toContain('i.deleted_at IS NULL')
    expect(params).toEqual(['vid-1'])
  })

  it('500s when the query fails', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db'))
    expect((await request(app).get('/api/items/vid-1/derived').set('Authorization', AUTH)).status).toBe(500)
  })
})

describe('POST /api/items/:id/extract-recipe', () => {
  const RECIPE_ITEM = { ...FULL_ITEM, id: 'rec-1', type: 'recipe', title: 'Aglio e Olio', derived_from: 'vid-1' }

  it('requires auth', async () => {
    expect((await request(app).post('/api/items/vid-1/extract-recipe')).status).toBe(401)
  })

  it('404s for a missing item', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never)
    expect((await request(app).post('/api/items/nope/extract-recipe').set('Authorization', AUTH)).status).toBe(404)
  })

  it('409s with the existing recipe id when one was already extracted', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [ROW] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 'rec-0' }] } as never)
    const res = await request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH)
    expect(res.status).toBe(409)
    expect(res.body.existingId).toBe('rec-0')
    expect(extractRecipe).not.toHaveBeenCalled()
  })

  it('force skips the duplicate check', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never)
    vi.mocked(extractRecipe).mockResolvedValue({ found: false, reason: 'none', model: 'm' })
    const res = await request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH).send({ force: true })
    expect(res.status).toBe(422)
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1) // only the item load
  })

  it('422s with found:false when there is no recipe, and creates nothing', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never).mockResolvedValueOnce({ rows: [] } as never)
    vi.mocked(extractRecipe).mockResolvedValue({ found: false, reason: 'No recipe was found in this content.', model: 'm' })
    const res = await request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH)
    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({ found: false, error: 'No recipe was found in this content.' })
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('creates a NEW unreviewed recipe item linked via derived_from and leaves the video untouched', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never).mockResolvedValueOnce({ rows: [] } as never)
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never) // embedding update
    vi.mocked(extractRecipe).mockResolvedValue(FOUND)
    const client = mockClient([
      { rows: [] }, // BEGIN
      { rows: [{ id: 'rec-1' }] }, // INSERT
      { rows: [] }, // setItemCategories → resolve… (handled by empty default)
    ])
    // fetchItem is the last read inside createItem; give every later query the full row
    client.query.mockImplementation((sql: string) => {
      if (/^\s*SELECT/i.test(sql) && /FROM items i/.test(sql)) return Promise.resolve({ rows: [RECIPE_ITEM] })
      if (/INSERT INTO items/.test(sql)) return Promise.resolve({ rows: [{ id: 'rec-1' }] })
      return Promise.resolve({ rows: [{ id: 'cat-1' }] })
    })

    const res = await request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH).send({ provider: 'gemini' })

    expect(res.status).toBe(201)
    expect(res.body.confidence).toBe(80)
    expect(extractRecipe).toHaveBeenCalledWith(
      { title: 'Cook with Joe', content: VIDEO, sourceUrl: VIDEO },
      { provider: 'gemini', cloudSafe: true },
    )

    const insert = client.query.mock.calls.find(c => /INSERT INTO items/.test(c[0] as string))!
    expect(insert[0]).toContain('derived_from')
    const p = insert[1] as unknown[]
    expect(p[0]).toBe('Aglio e Olio') // title
    expect(p[1]).toBe('recipe') // type
    expect(p[4]).toBe('youtube') // source
    expect(p[5]).toBe(VIDEO) // source_url
    expect(p[6]).toBe(false) // reviewed=false → review queue
    expect(p[7]).toBe(80) // confidence
    expect(p[10]).toBe('vid-1') // derived_from

    const sqls = client.query.mock.calls.map(c => c[0] as string)
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls).toContain('COMMIT')
    expect(sqls.some(s => /UPDATE items SET extraction_model/.test(s))).toBe(true)
    expect(sqls.some(s => /UPDATE items[\s\S]*\bWHERE id = \$\d/.test(s) && /vid-1/.test(String(s)))).toBe(false)
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and 500s if saving fails', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never).mockResolvedValueOnce({ rows: [] } as never)
    vi.mocked(extractRecipe).mockResolvedValue(FOUND)
    const client = mockClient()
    client.query.mockImplementation((sql: string) =>
      /INSERT INTO items/.test(sql) ? Promise.reject(new Error('insert failed')) : Promise.resolve({ rows: [] }))
    const res = await request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH)
    expect(res.status).toBe(500)
    expect(client.query.mock.calls.map(c => c[0])).toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })

  it('maps provider and source errors like explain does', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never).mockResolvedValueOnce({ rows: [] } as never)
    vi.mocked(extractRecipe).mockRejectedValue(new NoSourceTextError('No transcript'))
    expect((await request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH)).status).toBe(422)

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [ROW] } as never).mockResolvedValueOnce({ rows: [] } as never)
    vi.mocked(extractRecipe).mockRejectedValue(new AiProviderError('claude', 'blocked', 'no key'))
    expect((await request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH)).status).toBe(409)
  })
})
