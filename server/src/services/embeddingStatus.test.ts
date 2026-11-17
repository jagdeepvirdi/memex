import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiConfig } from './settings.js'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
const mockGetAiConfig = vi.fn()
vi.mock('./settings.js', () => ({ getAiConfig: () => mockGetAiConfig() }))
const mockListProviders = vi.fn()
vi.mock('./ai.js', () => ({ listProviders: () => mockListProviders() }))

import { pool } from '../db/client'
import { getEmbeddingStatus } from './embeddingStatus'
import { setActiveEmbedding, buildEmbedding } from './embeddingConfig'

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({
  model: 'llama3.2', useClaude: false, strictLocal: false, provider: 'ollama',
  claudeModel: 'c', geminiModel: 'g', openaiModel: 'o', perTask: {}, allowCloud: true, ...over,
})
const providers = (geminiKey: boolean) => [
  { id: 'ollama', configured: true }, { id: 'gemini', configured: geminiKey }, { id: 'openai', configured: false },
]
const COUNTS = { embedded: '700', needs_reembed: '61', skipped_private: '3', pending: '88', total: '852' }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAiConfig.mockResolvedValue(cfg())
  mockListProviders.mockResolvedValue(providers(true))
  vi.mocked(pool.query).mockResolvedValue({ rows: [COUNTS] } as any)
})
afterEach(() => setActiveEmbedding(null))

describe('getEmbeddingStatus', () => {
  it('reports the local model as usable with item counts', async () => {
    const s = await getEmbeddingStatus()
    expect(s).toMatchObject({
      provider: 'ollama', model: 'nomic-embed-text', id: 'ollama:nomic-embed-text',
      cloud: false, configured: true, usable: true, blockedReason: null,
      counts: { embedded: 700, needsReembed: 61, skippedPrivate: 3, pending: 88, total: 852 },
    })
  })

  it('counts against the active model id', async () => {
    await getEmbeddingStatus()
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(['ollama:nomic-embed-text'])
  })

  it('treats a missing row as zero counts', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any)
    expect((await getEmbeddingStatus()).counts).toEqual({ embedded: 0, needsReembed: 0, skippedPrivate: 0, pending: 0, total: 0 })
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
