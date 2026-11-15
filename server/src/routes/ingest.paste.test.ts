import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { findItemsBySourceUrl } from '../services/duplicateService'
import { classifyAndUpdateBatch } from '../services/enrichBatch'

// The limiter default is 30/min — far below what this file sends.
vi.hoisted(() => { process.env.INGEST_RATE_LIMIT_MAX = '1000' })

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/classifier', () => ({ classify: vi.fn(), classifyBatch: vi.fn() }))
vi.mock('../services/scraper', () => ({ scrapeUrl: vi.fn() }))
vi.mock('../services/summarizer', () => ({ summarizeAndClassify: vi.fn() }))
vi.mock('../services/embedder', () => ({ embedQuery: vi.fn(), embedItem: vi.fn() }))
vi.mock('../services/duplicateService', async orig => ({
  ...(await orig<typeof import('../services/duplicateService')>()),
  findSimilarItems: vi.fn().mockResolvedValue([]),
  findItemsBySourceUrl: vi.fn().mockResolvedValue([]),
}))
vi.mock('../services/enrichBatch', () => ({ classifyAndUpdateBatch: vi.fn().mockResolvedValue(undefined) }))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

/** pool.connect() client: BEGIN/COMMIT return nothing, every INSERT INTO items returns the next id. */
function mockClient() {
  let n = 0
  const client = {
    query: vi.fn().mockImplementation(async (sql: string) =>
      /INSERT INTO items/.test(sql) ? { rows: [{ id: `item-${++n}` }] } : { rows: [] }),
    release: vi.fn(),
  }
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  return client
}

const post = (body: unknown) => request(app).post('/api/ingest/paste/bulk').set('Authorization', AUTH).send(body as object)
const NO_RUNNING_JOB = { rows: [] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findItemsBySourceUrl).mockResolvedValue([])
  vi.mocked(pool.query).mockResolvedValue(NO_RUNNING_JOB as never)
})

describe('POST /api/ingest/paste/bulk — validation', () => {
  it('requires auth', async () => {
    expect((await request(app).post('/api/ingest/paste/bulk').send({ text: 'x' })).status).toBe(401)
  })

  it('400s when neither or both of text/entries are sent', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ text: 'a', entries: [{ text: 'b' }] })).status).toBe(400)
  })

  it('400s on an empty paste', async () => {
    const res = await post({ text: '  \n\n ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/empty/i)
  })

  it('400s with a clear message when there are too many entries', async () => {
    const text = Array.from({ length: 201 }, (_, i) => `https://github.com/o/r${i}`).join('\n')
    const res = await post({ text })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ max: 200 })
    expect(res.body.error).toMatch(/201/)
    expect(pool.connect).not.toHaveBeenCalled()
  })
})

describe('POST /api/ingest/paste/bulk — dry run', () => {
  it('returns the plan and writes nothing', async () => {
    vi.mocked(findItemsBySourceUrl).mockImplementation(async (url: string) =>
      url.includes('seen') ? [{ id: 'old-1', title: 'Seen repo', type: 'link', similarity: 1 }] as never : [])
    const res = await post({
      dryRun: true,
      text: 'https://github.com/a/new\nhttps://github.com/a/seen\nhttps://github.com/a/new',
    })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: true, total: 3, new: 1, skipped: 2 })
    expect(res.body.entries.map((e: { status: string; reason?: string }) => [e.status, e.reason])).toEqual([
      ['saved', undefined], ['skipped', 'already-saved'], ['skipped', 'duplicate-in-paste'],
    ])
    expect(res.body.entries[1]).toMatchObject({ existingId: 'old-1', existingTitle: 'Seen repo' })
    expect(pool.connect).not.toHaveBeenCalled()
    expect(classifyAndUpdateBatch).not.toHaveBeenCalled()
  })

  it('does not refuse a dry run while another import is running', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ '?column?': 1 }] } as never)
    expect((await post({ dryRun: true, text: 'a note' })).status).toBe(200)
  })
})

describe('POST /api/ingest/paste/bulk — import', () => {
  it('saves new entries as unreviewed notes, creates a job and starts background classification', async () => {
    const client = mockClient()
    const res = await post({
      text: 'https://github.com/anthropics/claude-code\n\n---\n\nCool prompt idea\n\n---\n\nhttps://github.com/anthropics/claude-code/',
    })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: false, total: 3, new: 2, skipped: 1, saved: 2 })
    expect(res.body.jobId).toEqual(expect.any(String))

    const inserts = client.query.mock.calls.filter(c => /INSERT INTO items/.test(c[0]))
    expect(inserts).toHaveLength(2)
    expect(inserts[0][1]).toEqual([
      'https://github.com/anthropics/claude-code', 'https://github.com/anthropics/claude-code', 'url', 'https://github.com/anthropics/claude-code',
    ])
    expect(inserts[1][1]).toEqual(['Cool prompt idea', 'Cool prompt idea', 'manual', null])
    const sqls = client.query.mock.calls.map(c => c[0])
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls).toContain('COMMIT')

    // results line up with the paste and carry the new item ids
    expect(res.body.entries.map((e: { status: string; itemId?: string }) => [e.status, e.itemId])).toEqual([
      ['saved', 'item-1'], ['saved', 'item-2'], ['skipped', undefined],
    ])

    const [ids, batch, jobId, opts] = vi.mocked(classifyAndUpdateBatch).mock.calls[0]
    expect(ids).toEqual(['item-1', 'item-2'])
    expect(batch).toEqual([
      { content: 'https://github.com/anthropics/claude-code', source: 'url', sourceUrl: 'https://github.com/anthropics/claude-code' },
      { content: 'Cool prompt idea', source: 'manual', sourceUrl: undefined },
    ])
    expect(jobId).toBe(res.body.jobId)
    expect(opts?.details).toHaveProperty('entries')

    const jobSql = vi.mocked(pool.query).mock.calls.map(c => String(c[0])).filter(q => /ingest_jobs/.test(q))
    expect(jobSql.some(q => /INSERT INTO ingest_jobs/.test(q))).toBe(true)
    expect(vi.mocked(pool.query).mock.calls.find(c => /INSERT INTO ingest_jobs/.test(String(c[0])))![1]).toEqual([res.body.jobId, 2, 'paste-import'])
  })

  it('accepts pre-split entries', async () => {
    mockClient()
    const res = await post({ entries: [{ text: 'one' }, { text: '  ' }, { text: 'two' }] })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 2, saved: 2 })
  })

  it('saves nothing and starts no job when every entry is a duplicate', async () => {
    vi.mocked(findItemsBySourceUrl).mockResolvedValue([{ id: 'old', title: 'Old', type: 'link', similarity: 1 }] as never)
    const res = await post({ text: 'https://github.com/a/b' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ saved: 0, jobId: null, skipped: 1 })
    expect(pool.connect).not.toHaveBeenCalled()
    expect(classifyAndUpdateBatch).not.toHaveBeenCalled()
  })

  it('409s while another paste import is running', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ '?column?': 1 }] } as never)
    const res = await post({ text: 'a note' })
    expect(res.status).toBe(409)
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('rolls back, releases the connection and 500s if saving fails', async () => {
    const client = mockClient()
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO items/.test(sql)) throw new Error('insert failed')
      return { rows: [] }
    })
    const res = await post({ text: 'a note' })
    expect(res.status).toBe(500)
    expect(client.query.mock.calls.map(c => c[0])).toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
    expect(classifyAndUpdateBatch).not.toHaveBeenCalled()
  })

  it('marks the job failed if the background batch crashes outright', async () => {
    mockClient()
    vi.mocked(classifyAndUpdateBatch).mockRejectedValueOnce(new Error('boom'))
    const res = await post({ text: 'a note' })
    expect(res.status).toBe(200)
    await vi.waitFor(() => {
      const sqls = vi.mocked(pool.query).mock.calls.map(c => String(c[0]))
      expect(sqls.some(q => /status='failed'/.test(q))).toBe(true)
    })
  })
})
