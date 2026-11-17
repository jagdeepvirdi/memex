import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'
import { pool } from '../db/client'
import { aiEmbed } from '../services/ai'
import logger from '../lib/logger'

// A capture route must still save when the EMBEDDING fails (Ollama is down, a cloud embedding model is blocked or not
// chosen yet), because the embedding only feeds the "you may already have this" hint. Here the real embedder and the real
// duplicate service run; only the model call underneath fails.
vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/ai', async (orig) => ({ ...(await orig<typeof import('../services/ai')>()), aiEmbed: vi.fn() }))
vi.mock('../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../services/classifier', () => ({
  classify: vi.fn().mockResolvedValue({
    type: 'note', title: 'Garlic pasta', categories: [], tags: [], summary: 'A pasta', structured: {}, confidence: 90, intent: 'reference',
  }),
  classifyBatch: vi.fn(),
}))
vi.mock('../services/scraper', () => ({
  scrapeUrl: vi.fn().mockResolvedValue({ title: 'Page', content: 'Some page content', url: 'https://example.com/a' }),
}))
vi.mock('../services/summarizer', () => ({
  summarizeAndClassify: vi.fn().mockResolvedValue({
    title: 'Page', type: 'link', content: 'Some page content', categories: [], tags: [], source: 'url', structured: {},
  }),
}))
vi.mock('../services/settings', async (orig) => ({
  ...(await orig<typeof import('../services/settings')>()),
  getSetting: vi.fn().mockResolvedValue(false),
}))

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never) // no saved page matches the URL
})

describe('capture routes when the embedding fails', () => {
  it('POST /api/ingest/text still returns the preview, with no duplicate hint', async () => {
    vi.mocked(aiEmbed).mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'))
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'Garlic pasta: boil, toss with oil' })
    expect(res.status).toBe(200)
    expect(res.body.preview).toMatchObject({ title: 'Garlic pasta', type: 'note', source: 'manual' })
    expect(res.body.similarItems).toEqual([])
    expect(aiEmbed).toHaveBeenCalled() // it did try
  })

  it('POST /api/ingest/url still returns the preview', async () => {
    vi.mocked(aiEmbed).mockRejectedValue(new Error('embedding provider down'))
    const res = await request(app).post('/api/ingest/url').set('Authorization', AUTH).send({ url: 'https://example.com/a' })
    expect(res.status).toBe(200)
    expect(res.body.preview).toMatchObject({ title: 'Page', source: 'url' })
    expect(res.body.similarItems).toEqual([])
  })

  it('also survives a blocked cloud embedding model (no consent, Strict Local Mode)', async () => {
    const { AiProviderError } = await import('../services/ai')
    vi.mocked(aiEmbed).mockRejectedValue(new AiProviderError('gemini', 'blocked', 'Cannot embed with gemini: Strict Local Mode is on'))
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'anything' })
    expect(res.status).toBe(200)
  })

  it('says why in the log, so the missing hint is not a mystery', async () => {
    vi.mocked(aiEmbed).mockRejectedValue(new Error('connect ECONNREFUSED'))
    await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'x' })
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: 'connect ECONNREFUSED' }), expect.stringMatching(/duplicate check/i))
  })

  it('does NOT hide a classification failure: that still fails the request', async () => {
    const { classify } = await import('../services/classifier')
    vi.mocked(aiEmbed).mockResolvedValue([0.1, 0.2])
    vi.mocked(classify).mockRejectedValueOnce(new Error('classifier down'))
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'x' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to classify text')
  })

  it('with a working embedding the hint is computed as before', async () => {
    vi.mocked(aiEmbed).mockResolvedValue([0.1, 0.2])
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'i1', title: 'Garlic pasta (old)', type: 'note', similarity: 0.96 }] } as never)
    const res = await request(app).post('/api/ingest/text').set('Authorization', AUTH).send({ text: 'Garlic pasta again' })
    expect(res.status).toBe(200)
    expect(res.body.similarItems).toEqual([{ id: 'i1', title: 'Garlic pasta (old)', type: 'note', similarity: 0.96 }])
  })
})
