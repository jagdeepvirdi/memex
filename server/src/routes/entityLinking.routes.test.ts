import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { extractAndLinkEntities } from '../services/entityService'

// Entity linking must run on every path that saves or rewrites a repo / video item.
// The linking itself is covered in entityService tests; here we check it is wired in.

vi.hoisted(() => { process.env.INGEST_RATE_LIMIT_MAX = '1000' })

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/classifier', () => ({
  classify: vi.fn(),
  classifyBatch: vi.fn(),
  mapToCategories: vi.fn().mockReturnValue([]),
}))
vi.mock('../services/scraper', () => ({
  scrapeUrl: vi.fn().mockResolvedValue({ title: 'claude-code', content: 'README', source: 'url', sourceUrl: 'https://github.com/anthropics/claude-code' }),
}))
vi.mock('../services/summarizer', () => ({
  summarizeAndClassify: vi.fn().mockResolvedValue({
    title: 'claude-code', type: 'link', content: 'README', categories: ['Tech', 'AI', 'Repos'], tags: ['ai'],
    source: 'url', sourceUrl: 'https://github.com/anthropics/claude-code', confidence: 90, intent: 'reference',
    structured: { kind: 'repo', repoName: 'anthropics/claude-code', summary: 's' },
  }),
}))
vi.mock('../services/embedder', () => ({
  embedQuery: vi.fn().mockResolvedValue([0.1]),
  embedItem: vi.fn().mockResolvedValue([0.1]),
}))
vi.mock('../services/duplicateService', async orig => ({
  ...(await orig<typeof import('../services/duplicateService')>()),
  findSimilarItems: vi.fn().mockResolvedValue([]),
  findItemsBySourceUrl: vi.fn().mockResolvedValue([]),
}))
vi.mock('../services/entityService', async orig => ({
  ...(await orig<typeof import('../services/entityService')>()),
  extractAndLinkEntities: vi.fn().mockResolvedValue(undefined),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

const REPO_STRUCTURED = { kind: 'repo', repoName: 'anthropics/claude-code', creatorHandle: 'someone' }
const ITEM_ROW = {
  id: 'item-1', title: 'T', type: 'link', content: 'c', structured: REPO_STRUCTURED, source: 'url', source_url: null,
  encrypted: false, reviewed: false, created_at: new Date(), updated_at: new Date(), categories: [], tags: [],
}

/** pool.connect() client that answers by SQL shape and records the order of statements. */
function routedClient(extra: Array<[RegExp, unknown]> = []) {
  const client = {
    query: vi.fn().mockImplementation(async (sql: string) => {
      for (const [re, rows] of extra) if (re.test(sql)) return { rows }
      if (/INSERT INTO items/.test(sql)) return { rows: [{ id: 'item-1' }] }
      if (/FROM items i\b/.test(sql) && /WHERE i\.id = \$1/.test(sql)) return { rows: [ITEM_ROW] }
      return { rows: [{ id: 'row-id' }] } // category / tag lookups need an id
    }),
    release: vi.fn(),
  }
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)
})

describe('entity linking is wired into every save path', () => {
  it('POST /api/items links after the commit, with the saved type and structured data', async () => {
    const client = routedClient()
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send({
      title: 'claude-code', type: 'link', content: 'https://github.com/anthropics/claude-code',
      source: 'url', structured: REPO_STRUCTURED,
    })

    expect(res.status).toBe(201)
    expect(extractAndLinkEntities).toHaveBeenCalledWith(client, 'item-1', 'link', REPO_STRUCTURED)

    const order = client.query.mock.calls.map(c => String(c[0]))
    const commitAt = order.indexOf('COMMIT')
    expect(commitAt).toBeGreaterThan(-1)
    // linking is called after COMMIT, so a failed link can never undo the save
    expect(vi.mocked(extractAndLinkEntities).mock.invocationCallOrder[0])
      .toBeGreaterThan(client.query.mock.invocationCallOrder[commitAt])
  })

  it('POST /api/items still saves when linking has nothing to do', async () => {
    routedClient()
    const res = await request(app).post('/api/items').set('Authorization', AUTH).send({
      title: 'n', type: 'note', content: 'hello', source: 'manual',
    })
    expect(res.status).toBe(201)
    expect(extractAndLinkEntities).toHaveBeenCalledWith(expect.anything(), 'item-1', 'note', {})
  })

  it('POST /api/ingest/quicksave links the saved repo', async () => {
    const client = routedClient()
    const res = await request(app).post('/api/ingest/quicksave').set('Authorization', AUTH)
      .send({ url: 'https://github.com/anthropics/claude-code' })

    expect(res.status).toBe(200)
    expect(extractAndLinkEntities).toHaveBeenCalledTimes(1)
    const [c, id, type, structured] = vi.mocked(extractAndLinkEntities).mock.calls[0]
    expect(c).toBe(client)
    expect(id).toBe('item-1')
    expect(type).toBe('link')
    expect(structured).toMatchObject({ kind: 'repo', repoName: 'anthropics/claude-code' })
  })

  it('POST /api/items/:id/apply-extraction relinks from the applied extraction', async () => {
    const structured = { kind: 'repo', repoName: 'a/b', creatorHandle: 'newperson' }
    const client = routedClient([
      [/FROM item_extractions WHERE id/, [{ id: 'x1', type: 'link', title: 'T', structured, model: 'm', confidence: 80, tags: [], categories: [] }]],
    ])
    const res = await request(app).post('/api/items/item-1/apply-extraction/x1').set('Authorization', AUTH)

    expect(res.status).toBe(200)
    expect(extractAndLinkEntities).toHaveBeenCalledWith(client, 'item-1', 'link', structured)
    // inside the transaction, so a rollback also rolls back the links
    const order = client.query.mock.calls.map(c => String(c[0]))
    expect(vi.mocked(extractAndLinkEntities).mock.invocationCallOrder[0])
      .toBeLessThan(client.query.mock.invocationCallOrder[order.indexOf('COMMIT')])
  })
})
