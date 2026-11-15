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
vi.mock('../services/extractRecipeJob', async orig => ({
  ...(await orig<typeof import('../services/extractRecipeJob')>()),
  runExtractRecipeJob: vi.fn(),
}))

import { runExplainJob } from '../services/explainJob'
import { runExtractRecipeJob } from '../services/extractRecipeJob'

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
beforeEach(() => {
  vi.mocked(pool.query).mockReset()
  vi.mocked(pool.connect).mockReset()
  vi.mocked(runExtractRecipeJob).mockReset()
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

describe('POST /api/items/:id/extract-recipe (background job)', () => {
  /** pool.query routed by SQL: the item lookup, the "recipe already extracted" check, the running-job check, job writes. */
  function extractDb(over: { item?: Record<string, unknown> | null; existingRecipe?: string | null; running?: boolean } = {}) {
    const item = over.item === undefined ? ROW : over.item
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (/FROM ingest_jobs/.test(sql)) return { rows: over.running ? [{ '?column?': 1 }] : [] }
      if (/FROM items WHERE derived_from/.test(sql)) return { rows: over.existingRecipe ? [{ id: over.existingRecipe }] : [] }
      if (/FROM items i WHERE i\.id = \$1/.test(sql)) return { rows: item ? [item] : [] }
      return { rows: [] }
    }) as never)
  }
  const post = (id = 'vid-1', body: unknown = {}) => request(app).post(`/api/items/${id}/extract-recipe`).set('Authorization', AUTH).send(body as object)
  const jobWrites = () => vi.mocked(pool.query).mock.calls.filter(c => /ingest_jobs/.test(String(c[0])) && !/FROM ingest_jobs/.test(String(c[0])))

  it('requires auth', async () => {
    expect((await request(app).post('/api/items/vid-1/extract-recipe')).status).toBe(401)
  })

  it('404s for a missing item, without touching jobs', async () => {
    extractDb({ item: null })
    expect((await post('nope')).status).toBe(404)
    expect(jobWrites()).toHaveLength(0)
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
  })

  it('400s on an invalid body', async () => {
    extractDb()
    expect((await post('vid-1', { provider: 'gpt' })).status).toBe(400)
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
  })

  it('refuses encrypted items', async () => {
    extractDb({ item: { ...ROW, encrypted: true } })
    expect((await post()).status).toBe(400)
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
  })

  it('409s with the existing recipe id when one was already extracted, and starts nothing', async () => {
    extractDb({ existingRecipe: 'rec-0' })
    const res = await post()
    expect(res.status).toBe(409)
    expect(res.body.existingId).toBe('rec-0')
    expect(jobWrites()).toHaveLength(0)
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
  })

  it('force skips the already-extracted check', async () => {
    extractDb({ existingRecipe: 'rec-0' })
    const res = await post('vid-1', { force: true })
    expect(res.status).toBe(202)
    expect(vi.mocked(pool.query).mock.calls.some(c => /FROM items WHERE derived_from/.test(String(c[0])))).toBe(false)
    expect(runExtractRecipeJob).toHaveBeenCalledTimes(1)
  })

  it('409s while another AI job is running, and starts nothing', async () => {
    extractDb({ running: true })
    const res = await post()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ running: true })
    expect(res.body.error).toMatch(/still running/)
    expect(jobWrites()).toHaveLength(0)
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
  })

  it('answers 202 with a jobId at once, creates the job row, and starts the runner with the item and options', async () => {
    extractDb()
    let release: () => void = () => {}
    vi.mocked(runExtractRecipeJob).mockReturnValue(new Promise<void>(r => { release = r }) as never) // still running when the response goes out
    const res = await post('vid-1', { provider: 'gemini' })

    expect(res.status).toBe(202)
    expect(res.body.jobId).toEqual(expect.any(String))
    const insert = jobWrites().find(c => /INSERT INTO ingest_jobs/.test(String(c[0])))!
    expect(insert[1]).toEqual([res.body.jobId, 1, 'extract-recipe'])
    expect(runExtractRecipeJob).toHaveBeenCalledWith({
      jobId: res.body.jobId, itemId: 'vid-1', title: 'Cook with Joe', content: VIDEO, sourceUrl: VIDEO,
      source: 'youtube', provider: 'gemini', cloudSafe: true,
    })
    release()
  })

  it('records which item the job is for', async () => {
    extractDb()
    const res = await post()
    const details = jobWrites().find(c => /SET details/.test(String(c[0])))!
    expect(details[1]).toEqual([res.body.jobId, JSON.stringify({ itemId: 'vid-1', stage: 'reading' })])
  })

  it('pins private items to local (cloudSafe=false)', async () => {
    extractDb({ item: { ...ROW, tags: ['private'] } })
    await post()
    expect(vi.mocked(runExtractRecipeJob).mock.calls[0][0]).toMatchObject({ cloudSafe: false })
  })

  it('does not create the recipe itself any more — that is the runner\'s job', async () => {
    extractDb()
    await post()
    expect(pool.connect).not.toHaveBeenCalled()
    expect(vi.mocked(pool.query).mock.calls.some(c => /INSERT INTO items/.test(String(c[0])))).toBe(false)
  })

  it('500s if the job cannot be created', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (/FROM ingest_jobs/.test(sql)) return { rows: [] }
      if (/FROM items WHERE derived_from/.test(sql)) return { rows: [] }
      if (/INSERT INTO ingest_jobs/.test(sql)) throw new Error('db down')
      return { rows: [ROW] }
    }) as never)
    expect((await post()).status).toBe(500)
    expect(runExtractRecipeJob).not.toHaveBeenCalled()
  })
})

describe('one AI job at a time, across Explain and Extract recipe', () => {
  /** Only the named job kind is "running". */
  function runningKind(kind: string | null) {
    vi.mocked(pool.query).mockImplementation((async (sql: string, params: unknown[] = []) => {
      if (/FROM ingest_jobs/.test(sql)) return { rows: params[0] === kind ? [{ '?column?': 1 }] : [] }
      if (/FROM items WHERE derived_from/.test(sql)) return { rows: [] }
      if (/FROM items i WHERE i\.id = \$1/.test(sql)) return { rows: [ROW] }
      return { rows: [] }
    }) as never)
  }
  const explain = () => request(app).post('/api/items/vid-1/explain').set('Authorization', AUTH).send({})
  const extract = () => request(app).post('/api/items/vid-1/extract-recipe').set('Authorization', AUTH).send({})

  it('a running extraction blocks Explain', async () => {
    runningKind('extract-recipe')
    expect((await explain()).status).toBe(409)
  })

  it('a running explanation blocks Extract recipe', async () => {
    runningKind('explain')
    expect((await extract()).status).toBe(409)
  })

  it('both start when nothing is running', async () => {
    runningKind(null)
    expect((await explain()).status).toBe(202)
    expect((await extract()).status).toBe(202)
  })
})
