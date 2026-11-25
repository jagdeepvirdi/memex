import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import AdmZip from 'adm-zip'
import { app } from '../index'
import { pool } from '../db/client'
import { classify } from '../services/classifier'
import { findItemsBySourceUrl, findItemsByExactText, findSimilarItems } from '../services/duplicateService'
import { scrapeUrl } from '../services/scraper'
import { getSetting } from '../services/settings'
import { loadBackfillPlan, previewSample, runBackfill } from '../services/youtubeBackfill'

vi.mock('../db/client', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}))

vi.mock('../services/classifier', () => ({
  classify: vi.fn().mockResolvedValue({
    type: 'note', title: 'Test', categories: [], tags: [], summary: '', structured: {},
  }),
  classifyBatch: vi.fn(),
}))

vi.mock('../services/scraper', () => ({
  scrapeUrl: vi.fn().mockResolvedValue({ title: 'Page', content: 'Content', url: 'https://example.com' }),
}))

vi.mock('../services/summarizer', () => ({
  summarizeAndClassify: vi.fn().mockResolvedValue({
    title: 'Page', type: 'link', content: 'Content', categories: [],
    tags: [], source: 'url', structured: {},
  }),
}))

vi.mock('../services/embedder', () => ({
  embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedForDuplicateCheck: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedItem:  vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}))

vi.mock('../services/duplicateService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/duplicateService')>()), // real mergeSimilar
  findSimilarItems: vi.fn().mockResolvedValue([]),
  findItemsBySourceUrl: vi.fn().mockResolvedValue([]),
  findItemsByExactText: vi.fn().mockResolvedValue([]),
}))

vi.mock('../services/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/settings')>()),
  getSetting: vi.fn().mockResolvedValue(false),
}))

vi.mock('../services/youtubeBackfill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/youtubeBackfill')>()), // real constants
  loadBackfillPlan: vi.fn(),
  previewSample: vi.fn().mockResolvedValue([]),
  runBackfill: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, failed: 0, aborted: false }),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

function makeKeepZip(notes: Array<{ title?: string; textContent?: string }>): Buffer {
  const zip = new AdmZip()
  notes.forEach((note, i) => {
    zip.addFile(`Keep/note${i}.json`, Buffer.from(JSON.stringify(note)))
  })
  return zip.toBuffer()
}

function mockClient(queries: Array<{ rows: unknown[] } | null>) {
  let i = 0
  const client = {
    query: vi.fn().mockImplementation(() => Promise.resolve(queries[i++] ?? { rows: [] })),
    release: vi.fn(),
  }
  vi.mocked(pool.connect).mockResolvedValue(client as any)
  return client
}

beforeEach(() => vi.clearAllMocks())

// ── POST /api/ingest/keep ─────────────────────────────────────────────────────

describe('POST /api/ingest/keep', () => {
  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/ingest/keep')
      .set('Authorization', AUTH)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/No file/i)
  })

  it('parses ZIP and returns notes array', async () => {
    const zip = makeKeepZip([
      { title: 'Dog Friendly', textContent: 'Bangkok' },
      { title: 'Recipe', textContent: 'Ingredients...' },
    ])

    const res = await request(app)
      .post('/api/ingest/keep')
      .set('Authorization', AUTH)
      .attach('file', zip, { filename: 'takeout.zip', contentType: 'application/zip' })

    expect(res.status).toBe(200)
    expect(res.body.notes).toHaveLength(2)
    expect(res.body.notes[0].title).toBe('Dog Friendly')
  })

  it('returns empty notes array for a ZIP with no Keep folder', async () => {
    const zip = new AdmZip()
    zip.addFile('other/file.json', Buffer.from('{}'))

    const res = await request(app)
      .post('/api/ingest/keep')
      .set('Authorization', AUTH)
      .attach('file', zip.toBuffer(), { filename: 'empty.zip', contentType: 'application/zip' })

    expect(res.status).toBe(200)
    expect(res.body.notes).toHaveLength(0)
  })
})

// ── POST /api/ingest/keep/bulk ────────────────────────────────────────────────

describe('POST /api/ingest/keep/bulk', () => {
  it('returns 400 when notes array is missing', async () => {
    const res = await request(app)
      .post('/api/ingest/keep/bulk')
      .set('Authorization', AUTH)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty notes array', async () => {
    const res = await request(app)
      .post('/api/ingest/keep/bulk')
      .set('Authorization', AUTH)
      .send({ notes: [] })
    expect(res.status).toBe(400)
  })

  it('saves notes to DB and returns saved count + jobId', async () => {
    const client = mockClient([
      null,                          // BEGIN
      { rows: [{ id: 'item-1' }] }, // INSERT note 1
      { rows: [{ id: 'item-2' }] }, // INSERT note 2
      null,                          // COMMIT
    ])

    const res = await request(app)
      .post('/api/ingest/keep/bulk')
      .set('Authorization', AUTH)
      .send({
        notes: [
          { title: 'Note 1', content: 'Content 1', labels: [] },
          { title: 'Note 2', content: 'Content 2', labels: [] },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.saved).toBe(2)
    expect(res.body.jobId).toBeDefined()
  })

  it('still completes the job when the last note to finish is empty', async () => {
    mockClient([null, { rows: [{ id: 'item-1' }] }, null]) // BEGIN, INSERT, COMMIT
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any)

    const res = await request(app)
      .post('/api/ingest/keep/bulk')
      .set('Authorization', AUTH)
      .send({ notes: [{ title: '', content: '', labels: [] }] })
    expect(res.status).toBe(200)

    await vi.waitFor(() => {
      const sqls = vi.mocked(pool.query).mock.calls.map((c) => String(c[0]))
      expect(sqls.some((q) => /status='completed'/.test(q))).toBe(true)
    })
  })
})

// ── GET /api/ingest/jobs/:id ──────────────────────────────────────────────────

describe('GET /api/ingest/jobs/:id', () => {
  it('returns 404 for unknown job id', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any)
    const res = await request(app)
      .get('/api/ingest/jobs/nonexistent')
      .set('Authorization', AUTH)
    expect(res.status).toBe(404)
  })

  it('returns job progress for a known job id', async () => {
    const fakeJobId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{
        id: fakeJobId,
        status: 'processing',
        progress: 50,
        total: 10,
        completed: 5,
        started_at: new Date('2025-01-01T00:00:00Z'),
        completed_at: null,
        error: null,
      }],
    } as any)

    const res = await request(app)
      .get(`/api/ingest/jobs/${fakeJobId}`)
      .set('Authorization', AUTH)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('progress', 50)
    expect(res.body).toHaveProperty('status', 'processing')
    expect(res.body).toHaveProperty('elapsed')
  })
})

// ── POST /api/ingest/text ─────────────────────────────────────────────────────

describe('POST /api/ingest/text', () => {
  it('returns 400 when text is missing', async () => {
    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({})
    expect(res.status).toBe(400)
  })

  it('classifies text and returns a preview', async () => {
    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'Chocolate cake recipe: mix flour and sugar' })

    expect(res.status).toBe(200)
    expect(res.body.preview).toBeDefined()
    expect(res.body.preview.source).toBe('manual')
    expect(res.body.preview.sourceUrl).toBeUndefined()
  })

  it('returns intent and confidence from the classifier', async () => {
    vi.mocked(classify).mockResolvedValueOnce({
      type: 'note', title: 'T', categories: [], tags: [], summary: '', structured: {},
      confidence: 77, intent: 'idea',
    })
    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'a fleeting thought' })

    expect(res.body.preview.intent).toBe('idea')
    expect(res.body.preview.confidence).toBe(77)
  })

  it('tags an Instagram caption as instagram and keeps the post URL', async () => {
    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'Top AI repos! https://www.instagram.com/p/Cabc123/ #ai' })

    expect(res.body.preview.source).toBe('instagram')
    expect(res.body.preview.sourceUrl).toBe('https://www.instagram.com/p/Cabc123/')
  })

  it('tags a pasted GitHub repo link as url and hints the classifier with it', async () => {
    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'https://github.com/anthropics/claude-code' })

    expect(res.body.preview.source).toBe('url')
    expect(res.body.preview.sourceUrl).toBe('https://github.com/anthropics/claude-code')
    expect(vi.mocked(classify)).toHaveBeenLastCalledWith(
      'https://github.com/anthropics/claude-code',
      { sourceUrl: 'https://github.com/anthropics/claude-code' },
    )
  })

  it('tags pasted text with one YouTube link as youtube and keeps the link', async () => {
    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'Gordon Ramsay pasta https://youtu.be/dQw4w9WgXcQ?si=x' })

    expect(res.body.preview.source).toBe('youtube')
    expect(res.body.preview.sourceUrl).toBe('https://youtu.be/dQw4w9WgXcQ?si=x')
  })

  it('does not force pasted notes into video classification (no transcript was fetched)', async () => {
    await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'Great pasta technique https://youtu.be/dQw4w9WgXcQ' })

    const hints = vi.mocked(classify).mock.calls.at(-1)?.[1]
    expect(hints).toEqual({ sourceUrl: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(hints).not.toHaveProperty('video')
  })

  it('leaves a note with several different YouTube links as manual', async () => {
    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/9bZkp7q19f0' })

    expect(res.body.preview.source).toBe('manual')
    expect(res.body.preview.sourceUrl).toBeUndefined()
  })

  it('lists an item already saved under the same YouTube link first, then near-duplicates', async () => {
    const sameUrl = { id: 'u1', title: 'Saved before', type: 'link', similarity: 1 }
    vi.mocked(findItemsBySourceUrl).mockResolvedValueOnce([sameUrl] as any)
    vi.mocked(findSimilarItems).mockResolvedValueOnce([
      { id: 'u1', title: 'Saved before', type: 'link', similarity: 0.96 },
      { id: 's2', title: 'Similar', type: 'note', similarity: 0.93 },
    ] as any)

    const res = await request(app)
      .post('/api/ingest/text')
      .set('Authorization', AUTH)
      .send({ text: 'pasta https://youtu.be/dQw4w9WgXcQ' })

    expect(findItemsBySourceUrl).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ')
    expect(res.body.similarItems.map((s: { id: string }) => s.id)).toEqual(['u1', 's2'])
    expect(res.body.similarItems[0].similarity).toBe(1)
  })

  it('lists a note with exactly the same text first, even when it has no embedding yet', async () => {
    vi.mocked(findItemsByExactText).mockResolvedValueOnce([{ id: 'x1', title: 'Saved a moment ago', type: 'note', similarity: 1 }] as any)
    vi.mocked(findSimilarItems).mockResolvedValueOnce([{ id: 's2', title: 'Similar', type: 'note', similarity: 0.93 }] as any)

    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'Buy oat milk and bread on Friday' })

    expect(findItemsByExactText).toHaveBeenCalledWith('Buy oat milk and bread on Friday')
    expect(res.body.similarItems.map((s: { id: string }) => s.id)).toEqual(['x1', 's2'])
    expect(res.body.similarItems[0].similarity).toBe(1)
  })

  it('skips the URL lookup when the text has no source URL', async () => {
    await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'buy milk' })
    expect(findItemsBySourceUrl).not.toHaveBeenCalled()
  })
})

// ── POST /api/ingest/url — same-page detection ───────────────────────────────

describe('POST /api/ingest/url', () => {
  it('returns an exact-URL match in similarItems', async () => {
    vi.mocked(findItemsBySourceUrl).mockResolvedValueOnce([{ id: 'u1', title: 'Saved', type: 'link', similarity: 1 }] as any)
    const res = await request(app).post('/api/ingest/url').set('Authorization', AUTH).send({ url: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(res.status).toBe(200)
    expect(res.body.similarItems).toEqual([{ id: 'u1', title: 'Saved', type: 'link', similarity: 1 }])
  })
})

// ── POST /api/ingest/quicksave — idempotent per URL ──────────────────────────

describe('POST /api/ingest/quicksave', () => {
  it('returns the existing item and does no scraping when the page is already saved', async () => {
    vi.mocked(findItemsBySourceUrl).mockResolvedValueOnce([{ id: 'u1', title: 'Saved', type: 'link', similarity: 1 }] as any)
    const res = await request(app).post('/api/ingest/quicksave').set('Authorization', AUTH).send({ url: 'https://youtu.be/dQw4w9WgXcQ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ item: { id: 'u1', title: 'Saved', type: 'link' }, similarItems: [], duplicate: true })
    expect(scrapeUrl).not.toHaveBeenCalled()
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('checks with limit 1 and still requires a URL', async () => {
    const bad = await request(app).post('/api/ingest/quicksave').set('Authorization', AUTH).send({})
    expect(bad.status).toBe(400)

    vi.mocked(findItemsBySourceUrl).mockResolvedValueOnce([{ id: 'u1', title: 'Saved', type: 'link', similarity: 1 }] as any)
    await request(app).post('/api/ingest/quicksave').set('Authorization', AUTH).send({ url: 'https://example.com/a' })
    expect(findItemsBySourceUrl).toHaveBeenCalledWith('https://example.com/a', 1)
  })
})

// ── POST /api/ingest/youtube/backfill ─────────────────────────────────────────

describe('POST /api/ingest/youtube/backfill', () => {
  const plan = {
    candidates: [{ id: 'i1', title: 'T', videoId: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    skipped: [{ id: 'i2', title: 'S', reason: 'reviewed', videoIds: ['dQw4w9WgXcQ'] }],
    duplicates: [],
  }
  const post = (body: unknown) => request(app).post('/api/ingest/youtube/backfill').set('Authorization', AUTH).send(body as object)

  beforeEach(() => {
    vi.mocked(getSetting).mockResolvedValue(false)
    vi.mocked(loadBackfillPlan).mockResolvedValue(plan as any)
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any)
  })

  it('rejects invalid input', async () => {
    expect((await post({ preview: 99 })).status).toBe(400)
    expect((await post({ dryRun: 'yes' })).status).toBe(400)
  })

  it('is a dry run by default: reports the plan and writes nothing', async () => {
    const res = await post({})
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ dryRun: true, counts: { candidates: 1, skipped: 1, duplicates: 0 } })
    expect(res.body.skipped[0].reason).toBe('reviewed')
    expect(runBackfill).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled() // no job row, no item writes
  })

  it('samples only the requested number of items in a dry run', async () => {
    await post({ dryRun: true, preview: 1 })
    expect(previewSample).toHaveBeenCalledWith(plan.candidates.slice(0, 1), expect.anything())
  })

  it('refuses in Strict Local Mode', async () => {
    vi.mocked(getSetting).mockResolvedValue(true)
    const res = await post({ dryRun: false })
    expect(res.status).toBe(409)
    expect(runBackfill).not.toHaveBeenCalled()
  })

  it('refuses while another backfill is running', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ '?column?': 1 }] } as any) // hasRunningJob → true
    const res = await post({ dryRun: false })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already running/i)
    expect(runBackfill).not.toHaveBeenCalled()
  })

  it('starts a job and returns its id when applying', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as any) // hasRunningJob → none
      .mockResolvedValue({ rows: [] } as any)     // createJob
    const res = await post({ dryRun: false })
    expect(res.status).toBe(202)
    expect(res.body.jobId).toBeTruthy()
    expect(res.body.total).toBe(1)
    expect(runBackfill).toHaveBeenCalledWith(res.body.jobId, plan)
  })

  it('does not create a job when there is nothing to do', async () => {
    vi.mocked(loadBackfillPlan).mockResolvedValue({ ...plan, candidates: [] } as any)
    const res = await post({ dryRun: false })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ jobId: null, total: 0 })
    expect(runBackfill).not.toHaveBeenCalled()
  })
})
