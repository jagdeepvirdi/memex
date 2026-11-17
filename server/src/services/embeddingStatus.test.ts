import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiConfig } from './settings.js'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
const mockGetAiConfig = vi.fn()
vi.mock('./settings.js', () => ({ getAiConfig: () => mockGetAiConfig() }))
const mockListProviders = vi.fn()
vi.mock('./ai.js', () => ({ listProviders: () => mockListProviders() }))

import { pool } from '../db/client'
import { getEmbeddingStatus, embeddingBlockedReason } from './embeddingStatus'
import { setActiveEmbedding, buildEmbedding } from './embeddingConfig'

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({
  model: 'llama3.2', useClaude: false, strictLocal: false, provider: 'ollama',
  claudeModel: 'c', geminiModel: 'g', openaiModel: 'o', groqModel: 'q', perTask: {}, allowCloud: true, ...over,
})
const providers = (geminiKey: boolean) => [
  { id: 'ollama', configured: true }, { id: 'gemini', configured: geminiKey }, { id: 'openai', configured: false },
]
const COUNTS = { embedded: '700', needs_reembed: '61', skipped_private: '3', pending: '88', total: '852' }

/** The status runs a counts query and a running-job query; answer each by what it selects. */
function db(opts: { counts?: Record<string, string> | null; job?: Record<string, unknown> | null } = {}) {
  vi.mocked(pool.query).mockImplementation((async (sql: string) => {
    if (/FROM ingest_jobs/.test(String(sql))) return { rows: opts.job ? [opts.job] : [] }
    return { rows: opts.counts === null ? [] : [opts.counts ?? COUNTS] }
  }) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAiConfig.mockResolvedValue(cfg())
  mockListProviders.mockResolvedValue(providers(true))
  db()
})
afterEach(() => setActiveEmbedding(null))

describe('getEmbeddingStatus', () => {
  it('reports the local model as usable with item counts and no job', async () => {
    const s = await getEmbeddingStatus()
    expect(s).toMatchObject({
      provider: 'ollama', model: 'nomic-embed-text', id: 'ollama:nomic-embed-text',
      cloud: false, configured: true, usable: true, blockedReason: null, job: null,
      counts: { embedded: 700, needsReembed: 61, skippedPrivate: 3, pending: 88, total: 852 },
    })
  })

  it('counts against the active model id and never counts encrypted items', async () => {
    await getEmbeddingStatus()
    const [sql, params] = vi.mocked(pool.query).mock.calls.find(c => !/ingest_jobs/.test(String(c[0])))!
    expect(params).toEqual(['ollama:nomic-embed-text'])
    expect(String(sql)).toMatch(/encrypted = false/)
  })

  it('does not count a private-skipped item as needing a re-embed, even if it still has an older vector', async () => {
    await getEmbeddingStatus()
    const sql = String(vi.mocked(pool.query).mock.calls.find(c => !/ingest_jobs/.test(String(c[0])))![0])
    expect(sql).toMatch(/embedding_model IS DISTINCT FROM \$1\s+AND embedding_skip IS NULL/)
    expect(sql).toMatch(/embedding_skip = 'private'\) AS skipped_private/)
  })

  it('treats a missing row as zero counts', async () => {
    db({ counts: null })
    expect((await getEmbeddingStatus()).counts).toEqual({ embedded: 0, needsReembed: 0, skippedPrivate: 0, pending: 0, total: 0 })
  })

  it('includes the running re-embed job so the page can follow it after a reload', async () => {
    db({ job: { id: 'job-9', progress: 40, completed: 40, total: 100 } })
    expect((await getEmbeddingStatus()).job).toEqual({ id: 'job-9', progress: 40, completed: 40, total: 100 })
    const [sql, params] = vi.mocked(pool.query).mock.calls.find(c => /ingest_jobs/.test(String(c[0])))!
    expect(String(sql)).toMatch(/status = 'processing'/)
    expect(params).toEqual(['reembed', '6'])
  })

  describe('with a cloud model', () => {
    beforeEach(() => setActiveEmbedding(buildEmbedding('gemini')))

    it('is usable with consent and a key', async () => {
      const s = await getEmbeddingStatus()
      expect(s).toMatchObject({ provider: 'gemini', cloud: true, configured: true, usable: true, blockedReason: null })
    })

    it('explains that Strict Local Mode pauses semantic search', async () => {
      mockGetAiConfig.mockResolvedValue(cfg({ strictLocal: true, allowCloud: false }))
      const s = await getEmbeddingStatus()
      expect(s.usable).toBe(false)
      expect(s.blockedReason).toMatch(/Strict Local Mode.*keyword/)
    })

    it('explains missing cloud consent', async () => {
      mockGetAiConfig.mockResolvedValue(cfg({ allowCloud: false }))
      expect((await getEmbeddingStatus()).blockedReason).toMatch(/not enabled/)
    })

    it('explains a missing key', async () => {
      mockListProviders.mockResolvedValue(providers(false))
      const s = await getEmbeddingStatus()
      expect(s).toMatchObject({ configured: false, usable: false })
      expect(s.blockedReason).toMatch(/No API key.*gemini/)
    })
  })
})

describe('embeddingBlockedReason', () => {
  it('is null for the local model without reading any settings', async () => {
    expect(await embeddingBlockedReason()).toBeNull()
    expect(mockGetAiConfig).not.toHaveBeenCalled()
  })

  it('checks the model it is given, not only the active one', async () => {
    mockGetAiConfig.mockResolvedValue(cfg({ allowCloud: false }))
    expect(await embeddingBlockedReason(buildEmbedding('openai'))).toMatch(/not enabled/)
  })

  it('applies the rules in order: Strict Local, then consent, then key', async () => {
    mockListProviders.mockResolvedValue(providers(false))
    mockGetAiConfig.mockResolvedValue(cfg({ strictLocal: true, allowCloud: false }))
    expect(await embeddingBlockedReason(buildEmbedding('gemini'))).toMatch(/Strict Local/)
    mockGetAiConfig.mockResolvedValue(cfg({ allowCloud: false }))
    expect(await embeddingBlockedReason(buildEmbedding('gemini'))).toMatch(/not enabled/)
    mockGetAiConfig.mockResolvedValue(cfg())
    expect(await embeddingBlockedReason(buildEmbedding('gemini'))).toMatch(/No API key/)
  })
})
