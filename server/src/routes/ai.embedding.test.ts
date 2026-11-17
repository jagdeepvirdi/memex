import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'

// The write limiter (10/min) is shared by every test in this file; it reads this env var when the route module loads.
vi.hoisted(() => { process.env.AI_EMBEDDING_RATE_LIMIT_MAX = '1000' })

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))

const mockStatus = vi.fn()
const mockBlocked = vi.fn()
vi.mock('../services/embeddingStatus', () => ({
  getEmbeddingStatus: () => mockStatus(),
  embeddingBlockedReason: (...a: unknown[]) => mockBlocked(...a),
  REEMBED_JOB_KIND: 'reembed',
  REEMBED_STALE_HOURS: 6,
}))

const mockEstimate = vi.fn()
const mockSwitch = vi.fn()
const mockRunning = vi.fn()
vi.mock('../services/embeddingSwitch', async (orig) => ({
  ...(await orig<typeof import('../services/embeddingSwitch')>()),
  estimateReembed: (...a: unknown[]) => mockEstimate(...a),
  switchEmbeddingModel: (...a: unknown[]) => mockSwitch(...a),
  reembedRunning: () => mockRunning(),
}))

const mockRunJob = vi.fn()
vi.mock('../services/reembedJob', () => ({ runReembedJob: (...a: unknown[]) => mockRunJob(...a), REEMBED_JOB_KIND: 'reembed' }))
const mockCreateJob = vi.fn()
vi.mock('../services/ingestJobs', async (orig) => ({
  ...(await orig<typeof import('../services/ingestJobs')>()),
  createJob: (...a: unknown[]) => mockCreateJob(...a),
}))

import { EmbeddingSwitchError } from '../services/embeddingSwitch'
import { setActiveEmbedding, buildEmbedding } from '../services/embeddingConfig'

let AUTH = ''
beforeAll(() => {
  const secret = process.env.JWT_SECRET || 'memex-default-secret'
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, secret)}`
})
beforeEach(() => {
  vi.clearAllMocks()
  mockBlocked.mockResolvedValue(null)
  mockRunning.mockResolvedValue(false)
  mockCreateJob.mockResolvedValue(undefined)
  mockRunJob.mockResolvedValue(undefined)
  setActiveEmbedding(buildEmbedding('gemini'))
})
afterEach(() => setActiveEmbedding(null))

const get = (path: string) => request(app).get(path).set('Authorization', AUTH)
const put = (path: string, body: unknown) => request(app).put(path).set('Authorization', AUTH).send(body as object)
const post = (path: string, body: unknown) => request(app).post(path).set('Authorization', AUTH).send(body as object)

const STATUS = {
  provider: 'gemini', model: 'gemini-embedding-001', id: 'gemini:gemini-embedding-001', cloud: true, configured: true,
  usable: true, blockedReason: null, counts: { embedded: 10, needsReembed: 2, skippedPrivate: 1, pending: 0, total: 13 }, job: null,
}
const ESTIMATE = { cloud: true, items: 2, characters: 1000, approxTokens: 250, skippedPrivate: 1, alreadyDone: 0, entities: 0, blockedReason: null }

describe('GET /api/ai/embedding', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/ai/embedding')).status).toBe(401)
  })

  it('returns the embedding status', async () => {
    mockStatus.mockResolvedValueOnce(STATUS)
    const res = await get('/api/ai/embedding')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(STATUS)
  })

  it('returns a 500 with a plain message when the status cannot be read', async () => {
    mockStatus.mockRejectedValueOnce(new Error('db down'))
    const res = await get('/api/ai/embedding')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to read embedding status' })
  })
})

describe('GET /api/ai/embedding/estimate', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/ai/embedding/estimate')).status).toBe(401)
  })

  it('estimates the model asked for, without switching to it', async () => {
    mockEstimate.mockResolvedValueOnce(ESTIMATE)
    const res = await get('/api/ai/embedding/estimate?provider=openai&model=text-embedding-3-large')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(ESTIMATE)
    expect(mockEstimate.mock.calls[0][0]).toMatchObject({ provider: 'openai', model: 'text-embedding-3-large', id: 'openai:text-embedding-3-large' })
    expect(mockSwitch).not.toHaveBeenCalled()
  })

  it('estimates the active model when none is given', async () => {
    mockEstimate.mockResolvedValueOnce(ESTIMATE)
    await get('/api/ai/embedding/estimate')
    expect(mockEstimate.mock.calls[0][0]).toMatchObject({ id: 'gemini:gemini-embedding-001' })
  })

  it('rejects an unknown provider', async () => {
    const res = await get('/api/ai/embedding/estimate?provider=claude')
    expect(res.status).toBe(400)
    expect(mockEstimate).not.toHaveBeenCalled()
  })
})

describe('PUT /api/ai/embedding', () => {
  it('requires auth', async () => {
    expect((await request(app).put('/api/ai/embedding').send({ provider: 'gemini' })).status).toBe(401)
  })

  it('switches the model and returns the new status, without starting a job', async () => {
    mockSwitch.mockResolvedValueOnce(buildEmbedding('gemini'))
    mockStatus.mockResolvedValueOnce(STATUS)
    const res = await put('/api/ai/embedding', { provider: 'gemini', model: 'gemini-embedding-001' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual(STATUS)
    expect(mockSwitch).toHaveBeenCalledWith('gemini', 'gemini-embedding-001')
    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(mockRunJob).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown provider', { provider: 'claude' }],
    ['a missing provider', {}],
    ['an empty model', { provider: 'gemini', model: '   ' }],
    ['an over-long model', { provider: 'gemini', model: 'x'.repeat(101) }],
  ])('rejects %s', async (_n, body) => {
    const res = await put('/api/ai/embedding', body)
    expect(res.status).toBe(400)
    expect(mockSwitch).not.toHaveBeenCalled()
  })

  it('passes on the reason when the switch is refused (no consent, no key, job running)', async () => {
    mockSwitch.mockRejectedValueOnce(new EmbeddingSwitchError(409, 'Cloud AI is not enabled in Settings'))
    const res = await put('/api/ai/embedding', { provider: 'gemini' })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Cloud AI is not enabled in Settings' })
  })

  it('answers 500 with a plain message for an unexpected failure', async () => {
    mockSwitch.mockRejectedValueOnce(new Error('db down'))
    const res = await put('/api/ai/embedding', { provider: 'gemini' })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to switch the embedding model' })
  })
})

describe('POST /api/ai/embedding/reembed', () => {
  const ID = 'gemini:gemini-embedding-001'

  it('requires auth', async () => {
    expect((await request(app).post('/api/ai/embedding/reembed').send({ confirm: true, id: ID })).status).toBe(401)
  })

  it('starts a job for the active model and returns its id', async () => {
    const res = await post('/api/ai/embedding/reembed', { confirm: true, id: ID })
    expect(res.status).toBe(202)
    expect(typeof res.body.jobId).toBe('string')
    expect(mockCreateJob).toHaveBeenCalledWith(res.body.jobId, 1, 'reembed')
    expect(mockRunJob).toHaveBeenCalledTimes(1)
    expect(mockRunJob.mock.calls[0][0]).toMatchObject({ jobId: res.body.jobId, target: { id: ID } })
  })

  it.each([
    ['no confirmation', { id: ID }],
    ['confirm: false', { confirm: false, id: ID }],
    ['confirm as a string', { confirm: 'true', id: ID }],
    ['no model id', { confirm: true }],
  ])('does nothing without an explicit confirmation (%s)', async (_n, body) => {
    const res = await post('/api/ai/embedding/reembed', body)
    expect(res.status).toBe(400)
    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(mockRunJob).not.toHaveBeenCalled()
  })

  it('refuses when the model changed since the user saw the estimate', async () => {
    const res = await post('/api/ai/embedding/reembed', { confirm: true, id: 'openai:text-embedding-3-small' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/changed/)
    expect(mockRunJob).not.toHaveBeenCalled()
  })

  it('refuses when the model cannot be used (no consent, no key, Strict Local)', async () => {
    mockBlocked.mockResolvedValue('Strict Local Mode is on, so semantic search is paused and keyword search is used')
    const res = await post('/api/ai/embedding/reembed', { confirm: true, id: ID })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Strict Local/)
    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(mockRunJob).not.toHaveBeenCalled()
  })

  it('refuses a second job while one is running', async () => {
    mockRunning.mockResolvedValue(true)
    const res = await post('/api/ai/embedding/reembed', { confirm: true, id: ID })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already running/)
    expect(mockRunJob).not.toHaveBeenCalled()
  })

  it('answers 500 with a plain message when the job row cannot be created', async () => {
    mockCreateJob.mockRejectedValueOnce(new Error('db down'))
    const res = await post('/api/ai/embedding/reembed', { confirm: true, id: ID })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to start the re-embed' })
    expect(mockRunJob).not.toHaveBeenCalled()
  })
})
