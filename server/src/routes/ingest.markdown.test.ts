import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import AdmZip from 'adm-zip'
import { app } from '../index'
import { pool } from '../db/client'
import { classifyAndUpdateBatch } from '../services/enrichBatch'

vi.hoisted(() => { process.env.INGEST_RATE_LIMIT_MAX = '1000' })

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/classifier', () => ({ classify: vi.fn(), classifyBatch: vi.fn() }))
vi.mock('../services/scraper', () => ({ scrapeUrl: vi.fn() }))
vi.mock('../services/summarizer', () => ({ summarizeAndClassify: vi.fn() }))
vi.mock('../services/embedder', () => ({ embedQuery: vi.fn(), embedItem: vi.fn() }))
vi.mock('../services/enrichBatch', () => ({ classifyAndUpdateBatch: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../db/helpers', async orig => ({ ...(await orig<typeof import('../db/helpers')>()), setItemTags: vi.fn().mockResolvedValue(undefined) }))

let AUTH = ''
beforeAll(() => {
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, process.env.JWT_SECRET || 'memex-default-secret')}`
})

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

const zipOf = (files: Record<string, string>) => {
  const z = new AdmZip()
  for (const [name, text] of Object.entries(files)) z.addFile(name, Buffer.from(text, 'utf8'))
  return z.toBuffer()
}
const upload = (buf: Buffer, name: string, dryRun?: boolean) => {
  const r = request(app).post('/api/ingest/markdown').set('Authorization', AUTH).attach('file', buf, name)
  return dryRun === undefined ? r : r.field('dryRun', String(dryRun))
}

beforeEach(() => {
  vi.clearAllMocks()
  // no running job; no note already saved
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)
})

describe('POST /api/ingest/markdown', () => {
  it('requires auth', async () => {
    expect((await request(app).post('/api/ingest/markdown')).status).toBe(401)
  })

  it('400s with no file', async () => {
    const res = await request(app).post('/api/ingest/markdown').set('Authorization', AUTH)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no file/i)
  })

  it('400s on a file that is not a zip', async () => {
    const res = await upload(Buffer.from('not a zip'), 'notes.zip')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/ZIP/)
  })

  it('400s when the zip holds no notes', async () => {
    const res = await upload(zipOf({ 'a.png': 'x', '.obsidian/app.md': 'cfg' }), 'v.zip')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no markdown notes/i)
  })

  it('dry run returns the plan and writes nothing', async () => {
    const res = await upload(zipOf({ 'v/A.md': '# A\nbody a', 'v/B.md': 'body b', 'v/.trash/C.md': 'gone' }), 'v.zip', true)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: true, total: 2, new: 2, skipped: 0, otherFilesIgnored: 1 })
    expect(pool.connect).not.toHaveBeenCalled()
    expect(classifyAndUpdateBatch).not.toHaveBeenCalled()
  })

  it('saves new notes in a transaction, keeps tags, and starts background classification', async () => {
    const client = mockClient()
    const res = await upload(zipOf({ 'v/A.md': '---\ntags: [travel]\n---\n# Trip\nplan #food', 'v/B.md': 'plain body' }), 'v.zip')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: false, saved: 2, new: 2 })
    expect(res.body.jobId).toEqual(expect.any(String))
    const sqls = client.query.mock.calls.map(c => String(c[0]))
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls.filter(s => /INSERT INTO items/.test(s))).toHaveLength(2)
    expect(sqls.at(-1)).toBe('COMMIT')
    const [ids, entries] = vi.mocked(classifyAndUpdateBatch).mock.calls[0]
    expect(ids).toEqual(['item-1', 'item-2'])
    expect(entries[0]).toMatchObject({ title: 'Trip', labels: ['travel', 'food'], source: 'manual' })
  })

  it('skips a duplicate inside the zip and saves nothing when everything is skipped', async () => {
    mockClient()
    const same = zipOf({ 'a/X.md': '# X\nsame', 'b/X.md': '# X\nsame' })
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) =>
      /FROM items WHERE deleted_at IS NULL AND lower\(title\)/.test(String(sql)) ? ({ rows: [{ id: 'old-1' }] } as never) : ({ rows: [] } as never))
    const res = await upload(same, 'v.zip')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ saved: 0, jobId: null })
    expect(res.body.entries.map((e: { reason: string }) => e.reason).sort()).toEqual(['already-saved', 'duplicate-in-zip'])
    expect(classifyAndUpdateBatch).not.toHaveBeenCalled()
  })

  it('409s while another Markdown import is running', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'job-1' }] } as never)
    const res = await upload(zipOf({ 'A.md': 'body' }), 'v.zip')
    expect(res.status).toBe(409)
  })

  it('rolls back and answers 500 when saving fails', async () => {
    const client = mockClient()
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO items/.test(sql)) throw new Error('boom')
      return { rows: [] }
    })
    const res = await upload(zipOf({ 'A.md': 'body' }), 'v.zip')
    expect(res.status).toBe(500)
    expect(client.query.mock.calls.map(c => String(c[0]))).toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})
