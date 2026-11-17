import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('./ai', async (orig) => ({ ...(await orig<typeof import('./ai')>()), aiEmbed: vi.fn() }))
const mockDetailed = vi.fn()
vi.mock('./embeddingService', () => ({ embedAndStoreItemDetailed: (...a: unknown[]) => mockDetailed(...a) }))
vi.mock('./ingestJobs', () => ({
  reportJobProgress: vi.fn().mockResolvedValue(undefined),
  completeJob: vi.fn().mockResolvedValue(undefined),
  failJob: vi.fn().mockResolvedValue(undefined),
  cancelJob: vi.fn().mockResolvedValue(true),
}))

import { pool } from '../db/client'
import { aiEmbed, AiProviderError } from './ai'
import { reportJobProgress, completeJob, failJob, cancelJob } from './ingestJobs'
import { cancelRunningJob, runningJobCount } from './jobControl'
import { buildEmbedding, setActiveEmbedding } from './embeddingConfig'
import { runReembedJob } from './reembedJob'

const GEMINI = buildEmbedding('gemini')
const LOCAL = buildEmbedding('ollama')
const JOB = 'job-1'

type Row = { id: string; title: string; content: string }
const item = (n: number): Row => ({ id: `i${String(n).padStart(3, '0')}`, title: `Title ${n}`, content: `Body ${n}` })
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1))

/** A fake database: serves item/entity batches by keyset (`id > $2`) and records entity writes. */
function fakeDb(opts: { items?: Row[]; entities?: Array<{ id: string; name: string }> }) {
  const served = { entityWrites: [] as unknown[][] }
  vi.mocked(pool.query).mockImplementation((async (sql: string, params: unknown[]) => {
    const s = String(sql)
    if (/count\(\*\)/.test(s) && /FROM items/.test(s)) return { rows: [{ n: String((opts.items ?? []).length) }] }
    if (/count\(\*\)/.test(s) && /FROM entities/.test(s)) return { rows: [{ n: String((opts.entities ?? []).length) }] }
    if (/SELECT id, title, content FROM items/.test(s)) return { rows: (opts.items ?? []).filter(r => r.id > String(params[1])).slice(0, 20) }
    if (/SELECT id, name FROM entities/.test(s)) return { rows: (opts.entities ?? []).filter(r => r.id > String(params[1])).slice(0, 20) }
    if (/UPDATE entities/.test(s)) { served.entityWrites.push(params); return { rows: [] } }
    return { rows: [] }
  }) as never)
  return served
}

beforeEach(() => {
  vi.clearAllMocks()
  setActiveEmbedding(GEMINI)
  mockDetailed.mockResolvedValue({ outcome: 'embedded' })
  vi.mocked(aiEmbed).mockResolvedValue([0.1, 0.2])
})
afterEach(() => setActiveEmbedding(null))

describe('runReembedJob — items', () => {
  it('embeds every item through the single writer, in batches, and completes with counts', async () => {
    fakeDb({ items: items(45) })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(mockDetailed).toHaveBeenCalledTimes(45)
    const [row, target, signal] = mockDetailed.mock.calls[0]
    expect(row).toEqual(item(1))
    expect(target).toBe(GEMINI)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(completeJob).toHaveBeenCalledWith(JOB, { target: 'gemini:gemini-embedding-001', stage: 'items', embedded: 45, skippedPrivate: 0, failures: 0 })
    expect(failJob).not.toHaveBeenCalled()
    expect(cancelJob).not.toHaveBeenCalled()
  })

  it('reports progress against the total, starting at zero', async () => {
    fakeDb({ items: items(25) })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    const calls = vi.mocked(reportJobProgress).mock.calls
    expect(calls[0].slice(0, 3)).toEqual([JOB, 0, 25])
    expect(calls[calls.length - 1].slice(0, 3)).toEqual([JOB, 25, 25])
  })

  it('only selects what still needs a vector: not skipped, not encrypted, missing or from another model', async () => {
    fakeDb({ items: items(1) })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    const batch = vi.mocked(pool.query).mock.calls.map(c => String(c[0])).find(s => /SELECT id, title, content/.test(s))!
    expect(batch).toMatch(/encrypted = false/)
    expect(batch).toMatch(/embedding_skip IS NULL/)
    expect(batch).toMatch(/embedding IS NULL OR embedding_model IS DISTINCT FROM \$1/)
    expect(batch).toMatch(/ORDER BY id/)
    expect(vi.mocked(pool.query).mock.calls.find(c => /SELECT id, title, content/.test(String(c[0])))![1]).toEqual(['gemini:gemini-embedding-001', '00000000-0000-0000-0000-000000000000'])
  })

  it('counts private items the writer skipped', async () => {
    fakeDb({ items: items(4) })
    mockDetailed
      .mockResolvedValueOnce({ outcome: 'embedded' })
      .mockResolvedValueOnce({ outcome: 'skipped' })
      .mockResolvedValueOnce({ outcome: 'skipped' })
      .mockResolvedValueOnce({ outcome: 'embedded' })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(vi.mocked(completeJob).mock.calls[0][1]).toMatchObject({ embedded: 2, skippedPrivate: 2, failures: 0 })
  })

  it('carries on past an isolated failure and reports it', async () => {
    fakeDb({ items: items(6) })
    mockDetailed.mockResolvedValue({ outcome: 'embedded' })
    mockDetailed.mockResolvedValueOnce({ outcome: 'failed', error: new Error('one bad item') })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(mockDetailed).toHaveBeenCalledTimes(6)
    expect(vi.mocked(completeJob).mock.calls[0][1]).toMatchObject({ embedded: 5, failures: 1 })
  })

  it('nothing to do completes at once', async () => {
    fakeDb({ items: [] })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(mockDetailed).not.toHaveBeenCalled()
    expect(completeJob).toHaveBeenCalledTimes(1)
  })
})

describe('runReembedJob — stopping early', () => {
  it('stops after repeated failures instead of grinding through the whole library', async () => {
    fakeDb({ items: items(60) })
    mockDetailed.mockResolvedValue({ outcome: 'failed', error: new Error('provider down') })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(mockDetailed.mock.calls.length).toBeLessThan(12)
    expect(completeJob).not.toHaveBeenCalled()
    const [id, message] = vi.mocked(failJob).mock.calls[0]
    expect(id).toBe(JOB)
    expect(message).toMatch(/repeated failures.*provider down.*continue where it left off/s)
  })

  it('a success in between resets the failure streak', async () => {
    fakeDb({ items: items(12) })
    // fail x4, succeed, fail x4, succeed ... never 5 in a row
    const pattern = ['failed', 'failed', 'failed', 'failed', 'embedded', 'failed', 'failed', 'failed', 'failed', 'embedded', 'embedded', 'embedded']
    for (const outcome of pattern) mockDetailed.mockResolvedValueOnce({ outcome, error: outcome === 'failed' ? new Error('x') : undefined })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(failJob).not.toHaveBeenCalled()
    expect(completeJob).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['auth', 'Gemini rejected the API key'],
    ['blocked', 'Cannot embed with gemini: Strict Local Mode is on'],
  ] as const)('stops at once on a %s error and says why', async (kind, message) => {
    fakeDb({ items: items(30) })
    mockDetailed.mockResolvedValue({ outcome: 'failed', error: new AiProviderError('gemini', kind, message) })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(mockDetailed.mock.calls.length).toBeLessThanOrEqual(3) // only the first concurrent group ran
    expect(vi.mocked(failJob).mock.calls[0][1]).toBe(message)
    expect(vi.mocked(failJob).mock.calls[0][2]).toMatchObject({ kind })
  })

  it('refuses to run if the active model is not the one it was started for', async () => {
    fakeDb({ items: items(3) })
    setActiveEmbedding(LOCAL)
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(mockDetailed).not.toHaveBeenCalled()
    expect(vi.mocked(failJob).mock.calls[0][1]).toMatch(/model was changed/)
  })
})

describe('runReembedJob — cancel', () => {
  it('stops embedding, records "cancelled" (not failed, not completed) and leaves the job unregistered', async () => {
    fakeDb({ items: items(30) })
    let calls = 0
    mockDetailed.mockImplementation(async () => {
      if (++calls === 1) cancelRunningJob(JOB) // the user presses Cancel during the first call
      return { outcome: 'embedded' }
    })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(cancelJob).toHaveBeenCalledTimes(1)
    expect(completeJob).not.toHaveBeenCalled()
    expect(failJob).not.toHaveBeenCalled()
    expect(mockDetailed.mock.calls.length).toBeLessThan(30)
    expect(runningJobCount()).toBe(0)
  })

  it('unregisters the job when it finishes normally', async () => {
    fakeDb({ items: items(2) })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(runningJobCount()).toBe(0)
  })
})

describe('runReembedJob — entity names', () => {
  const ENTITIES = [{ id: 'e1', name: 'Some Director' }, { id: 'e2', name: 'Some City' }]

  it('embeds entity names with the local model, tagged with the model that made them', async () => {
    setActiveEmbedding(LOCAL)
    const db = fakeDb({ items: items(1), entities: ENTITIES })
    await runReembedJob({ jobId: JOB, target: LOCAL })
    expect(aiEmbed).toHaveBeenCalledWith('Some Director', expect.objectContaining({ kind: 'query' }))
    expect(db.entityWrites).toEqual([
      [JSON.stringify([0.1, 0.2]), 'ollama:nomic-embed-text', 'e1'],
      [JSON.stringify([0.1, 0.2]), 'ollama:nomic-embed-text', 'e2'],
    ])
    expect(vi.mocked(completeJob).mock.calls[0][1]).toMatchObject({ stage: 'entities', embedded: 3 })
  })

  it('never sends entity names to a cloud model', async () => {
    const db = fakeDb({ items: items(1), entities: ENTITIES })
    await runReembedJob({ jobId: JOB, target: GEMINI })
    expect(aiEmbed).not.toHaveBeenCalled()
    expect(db.entityWrites).toEqual([])
    expect(vi.mocked(pool.query).mock.calls.some(c => /FROM entities/.test(String(c[0])))).toBe(false)
  })
})
