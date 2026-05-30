import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import AdmZip from 'adm-zip'
import { app } from '../index'
import { pool } from '../db/client'

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
  })
})
