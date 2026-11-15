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
vi.mock('../services/explainJob', async orig => ({
  ...(await orig<typeof import('../services/explainJob')>()),
  runExplainJob: vi.fn(),
}))
vi.mock('../services/recipeExtractor', async orig => ({
  ...(await orig<typeof import('../services/recipeExtractor')>()),
  extractRecipe: vi.fn(),
}))

import { runExplainJob } from '../services/explainJob'
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
  vi.mocked(extractRecipe).mockReset()
})

describe('POST /api/items/:id/explain (background job)', () => {
  /** pool.query routed by SQL: the item lookup, the "is one already running" check, and the job writes. */
  function explainDb(over: { item?: Record<string, unknown> | null; running?: boolean } = {}) {
    const item = over.item === undefined ? ROW : over.item
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (/FROM ingest_jobs/.test(sql)) return { rows: over.running ? [{ '?column?': 1 }] : [] }
      if (/FROM items i WHERE i\.id = \$1/.test(sql)) return { rows: item ? [item] : [] }
      return { rows: [] }
    }) as never)
  }
  const post = (id = 'vid-1', body: unknown = {}) => request(app).post(`/api/items/${id}/explain`).set('Authorization', AUTH).send(body as object)
  const jobWrites = () => vi.mocked(pool.query).mock.calls.filter(c => /ingest_jobs/.test(String(c[0])) && !/FROM ingest_jobs/.test(String(c[0])))

  beforeEach(() => vi.mocked(runExplainJob).mockReset())

  it('requires auth', async () => {
    expect((await request(app).post('/api/items/vid-1/explain')).status).toBe(401)
  })

  it('404s for a missing item, without touching jobs', async () => {
    explainDb({ item: null })
    expect((await post('nope')).status).toBe(404)
    expect(jobWrites()).toHaveLength(0)
    expect(runExplainJob).not.toHaveBeenCalled()
  })

  it('400s on an invalid body', async () => {
    explainDb()
    expect((await post('vid-1', { provider: 'gpt' })).status).toBe(400)
    expect(runExplainJob).not.toHaveBeenCalled()
  })

  it('refuses encrypted items', async () => {
    explainDb({ item: { ...ROW, encrypted: true } })
    const res = await post()
    expect(res.status).toBe(400)
    expect(runExplainJob).not.toHaveBeenCalled()
  })

  it('409s when an explanation exists, unless force is set', async () => {
    explainDb({ item: { ...ROW, structured: { explanation: EXPLANATION } } })
    const res = await post()
    expect(res.status).toBe(409)
    expect(res.body.existing).toBe(true)
    expect(runExplainJob).not.toHaveBeenCalled()

    const forced = await post('vid-1', { force: true })
    expect(forced.status).toBe(202)
    expect(runExplainJob).toHaveBeenCalledTimes(1)
  })

  it('409s while another explanation is running, and starts nothing', async () => {
    explainDb({ running: true })
    const res = await post()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ running: true })
    expect(res.body.error).toMatch(/still running/)
    expect(jobWrites()).toHaveLength(0)
    expect(runExplainJob).not.toHaveBeenCalled()
  })

  it('treats a job older than 20 minutes as dead when checking for a running one', async () => {
    explainDb()
    await post()
    const check = vi.mocked(pool.query).mock.calls.find(c => /FROM ingest_jobs/.test(String(c[0])))!
    expect(check[1]).toEqual(['explain', '20'])
  })

  it('answers 202 with a jobId at once, creates the job row, and starts the runner with the item and options', async () => {
    explainDb()
    let release: () => void = () => {}
    vi.mocked(runExplainJob).mockReturnValue(new Promise<void>(r => { release = r }) as never) // still running when the response goes out
    const res = await post('vid-1', { provider: 'claude' })

    expect(res.status).toBe(202)
    expect(res.body.jobId).toEqual(expect.any(String))

    const insert = jobWrites().find(c => /INSERT INTO ingest_jobs/.test(String(c[0])))!
    expect(insert[1]).toEqual([res.body.jobId, 1, 'explain'])

    expect(runExplainJob).toHaveBeenCalledWith({
      jobId: res.body.jobId, itemId: 'vid-1', title: 'Cook with Joe', content: VIDEO, sourceUrl: VIDEO,
      provider: 'claude', cloudSafe: true,
    })
    release() // the runner was still going when the 202 went out
  })

  it('records which item the job is for, so the UI can find it again', async () => {
    explainDb()
    const res = await post()
    const details = jobWrites().find(c => /SET details/.test(String(c[0])))!
    expect(details[1]).toEqual([res.body.jobId, JSON.stringify({ itemId: 'vid-1', stage: 'reading' })])
  })

  it('pins private items to local (cloudSafe=false)', async () => {
    explainDb({ item: { ...ROW, tags: ['private'] } })
    await post()
    expect(vi.mocked(runExplainJob).mock.calls[0][0]).toMatchObject({ cloudSafe: false })
  })

  it('does not save the explanation itself any more — that is the runner\'s job', async () => {
    explainDb()
    await post()
    expect(vi.mocked(pool.query).mock.calls.some(c => /jsonb_set/.test(String(c[0])))).toBe(false)
  })

  it('500s if the job cannot be created', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (/FROM ingest_jobs/.test(sql)) return { rows: [] }
      if (/INSERT INTO ingest_jobs/.test(sql)) throw new Error('db down')
      return { rows: [ROW] }
    }) as never)
    expect((await post()).status).toBe(500)
    expect(runExplainJob).not.toHaveBeenCalled()
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
