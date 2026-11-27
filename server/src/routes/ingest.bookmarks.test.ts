import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
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

// Synthetic export: example.com addresses only.
const HTML = `<DL><p>
<DT><H3>Recipes</H3><DL><p>
<DT><A HREF="https://example.com/soup" TAGS="dinner">Soup</A>
<DT><A HREF="https://example.com/soup/">Soup again</A>
</DL><p>
<DT><A HREF="javascript:void(0)">Not a page</A>
<DT><A HREF="https://example.com/b">B</A>
</DL><p>`

const upload = (buf: Buffer | string, name: string, dryRun?: boolean) => {
  const r = request(app).post('/api/ingest/bookmarks').set('Authorization', AUTH).attach('file', Buffer.from(buf), name)
  return dryRun === undefined ? r : r.field('dryRun', String(dryRun))
}

beforeEach(() => {
  vi.clearAllMocks()
  // no running job; no link already saved
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never)
})

describe('POST /api/ingest/bookmarks', () => {
  it('requires auth', async () => {
    expect((await request(app).post('/api/ingest/bookmarks')).status).toBe(401)
  })

  it('400s with no file', async () => {
    const res = await request(app).post('/api/ingest/bookmarks').set('Authorization', AUTH)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no file/i)
  })

  it('400s on a file that is not a bookmarks export', async () => {
    const res = await upload('hello', 'notes.txt')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/bookmarks export/i)
  })

  it('400s when the file holds no bookmarks', async () => {
    const res = await upload('<html><body>nothing</body></html>', 'b.html')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no bookmarks/i)
  })

  it('dry run returns the plan and writes nothing', async () => {
    const res = await upload(HTML, 'b.html', true)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: true, total: 4, new: 2, skipped: 2 })
    expect(res.body.entries.map((e: { reason?: string }) => e.reason).filter(Boolean).sort()).toEqual(['duplicate-in-file', 'not-a-link'])
    expect(pool.connect).not.toHaveBeenCalled()
    expect(classifyAndUpdateBatch).not.toHaveBeenCalled()
  })

  it('saves new links in a transaction, keeps tags and starts background classification without fetching any page', async () => {
    const client = mockClient()
    const res = await upload(HTML, 'b.html')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: false, saved: 2, new: 2 })
    expect(res.body.jobId).toEqual(expect.any(String))
    const sqls = client.query.mock.calls.map(c => String(c[0]))
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls.filter(s => /INSERT INTO items/.test(s))).toHaveLength(2)
    expect(sqls.at(-1)).toBe('COMMIT')
    const [ids, entries] = vi.mocked(classifyAndUpdateBatch).mock.calls[0]
    expect(ids).toEqual(['item-1', 'item-2'])
    expect(entries[0]).toMatchObject({ title: 'Soup', labels: ['from-bookmarks', 'dinner', 'recipes'], source: 'url', sourceUrl: 'https://example.com/soup' })
  })

  it('skips a link that is already saved and saves nothing when everything is skipped', async () => {
    mockClient()
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) =>
      /FROM items WHERE deleted_at IS NULL AND encrypted = false/.test(String(sql))
        ? ({ rows: [{ id: 'old-1', source_url: 'https://example.com/b', content: null }] } as never)
        : ({ rows: [] } as never))
    const res = await upload('<DL><DT><A HREF="https://www.example.com/b/">B</A></DL>', 'b.html')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ saved: 0, jobId: null })
    expect(res.body.entries[0]).toMatchObject({ reason: 'already-saved', existingId: 'old-1' })
    expect(classifyAndUpdateBatch).not.toHaveBeenCalled()
  })

  it('409s while another bookmark import is running', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'job-1' }] } as never)
    const res = await upload(HTML, 'b.html')
    expect(res.status).toBe(409)
  })

  it('rolls back and answers 500 when saving fails', async () => {
    const client = mockClient()
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO items/.test(sql)) throw new Error('boom')
      return { rows: [] }
    })
    const res = await upload(HTML, 'b.html')
    expect(res.status).toBe(500)
    expect(client.query.mock.calls.map(c => String(c[0]))).toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})
