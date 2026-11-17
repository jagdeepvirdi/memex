import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const settings: Record<string, unknown> = {}
vi.mock('./settings.js', () => ({
  getSetting: vi.fn(async (key: string, dflt: unknown) => (key in settings ? settings[key] : dflt)),
}))

import {
  activeEmbedding, activeEmbeddingId, loadEmbeddingConfig, buildEmbedding, isEmbeddingProvider,
  setActiveEmbedding, DEFAULT_EMBEDDING_MODELS, EMBEDDING_DIMENSIONS, getThresholdOverrides, setThresholdOverrides,
} from './embeddingConfig'

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k]
  setActiveEmbedding(null)
  setThresholdOverrides(null)
})
afterEach(() => setActiveEmbedding(null))

describe('embedding config', () => {
  it('defaults to local nomic-embed-text, 768 dimensions', () => {
    expect(activeEmbedding()).toEqual({ provider: 'ollama', model: 'nomic-embed-text', id: 'ollama:nomic-embed-text' })
    expect(EMBEDDING_DIMENSIONS).toBe(768)
  })

  it('has a default model for every provider', () => {
    expect(DEFAULT_EMBEDDING_MODELS).toMatchObject({ gemini: 'gemini-embedding-001', openai: 'text-embedding-3-small' })
  })

  it('validates providers', () => {
    expect(isEmbeddingProvider('gemini')).toBe(true)
    expect(isEmbeddingProvider('claude')).toBe(false) // Anthropic has no embeddings API
    expect(isEmbeddingProvider(undefined)).toBe(false)
  })

  it('builds an id from provider and model, trimming and falling back to the default model', () => {
    expect(buildEmbedding('gemini').id).toBe('gemini:gemini-embedding-001')
    expect(buildEmbedding('openai', '  text-embedding-3-large ').id).toBe('openai:text-embedding-3-large')
    expect(buildEmbedding('openai', '   ').id).toBe('openai:text-embedding-3-small')
    expect(buildEmbedding('gemini', null).model).toBe('gemini-embedding-001')
  })
})

describe('loadEmbeddingConfig — calibrated thresholds', () => {
  it('has none by default', async () => {
    await loadEmbeddingConfig()
    expect(getThresholdOverrides()).toEqual({})
  })

  it('reads the per-model overrides from settings', async () => {
    settings.embedding_thresholds = { 'gemini:gemini-embedding-001': { duplicate: 0.955, graph: 0.83 } }
    await loadEmbeddingConfig()
    expect(getThresholdOverrides()).toEqual({ 'gemini:gemini-embedding-001': { duplicate: 0.955, graph: 0.83 } })
  })

  it.each([['a string', 'oops'], ['an array', [1, 2]], ['null', null], ['a number', 7]])('ignores %s', async (_n, bad) => {
    settings.embedding_thresholds = { 'x:y': { duplicate: 0.9 } }
    await loadEmbeddingConfig()
    settings.embedding_thresholds = bad
    await loadEmbeddingConfig()
    expect(getThresholdOverrides()).toEqual({})
  })

  it('drops the overrides again when the setting is removed', async () => {
    settings.embedding_thresholds = { 'x:y': { duplicate: 0.9 } }
    await loadEmbeddingConfig()
    delete settings.embedding_thresholds
    await loadEmbeddingConfig()
    expect(getThresholdOverrides()).toEqual({})
  })
})

describe('loadEmbeddingConfig', () => {
  it('keeps local Ollama when nothing is set', async () => {
    expect((await loadEmbeddingConfig()).id).toBe('ollama:nomic-embed-text')
  })

  it('reads the provider and model from settings and updates the cache', async () => {
    settings.embedding_provider = 'gemini'
    settings.embedding_model = 'gemini-embedding-2'
    await loadEmbeddingConfig()
    expect(activeEmbeddingId()).toBe('gemini:gemini-embedding-2')
  })

  it('uses the provider default when only the provider is set', async () => {
    settings.embedding_provider = 'openai'
    await loadEmbeddingConfig()
    expect(activeEmbeddingId()).toBe('openai:text-embedding-3-small')
  })

  it('falls back to Ollama for an unknown provider rather than breaking search', async () => {
    settings.embedding_provider = 'claude'
    settings.embedding_model = 'whatever'
    await loadEmbeddingConfig()
    expect(activeEmbedding().provider).toBe('ollama')
  })

  it('ignores a non-string model', async () => {
    settings.embedding_provider = 'gemini'
    settings.embedding_model = 42
    await loadEmbeddingConfig()
    expect(activeEmbedding().model).toBe('gemini-embedding-001')
  })

  it('switches back to Ollama when the setting is removed', async () => {
    settings.embedding_provider = 'gemini'
    await loadEmbeddingConfig()
    delete settings.embedding_provider
    await loadEmbeddingConfig()
    expect(activeEmbedding().provider).toBe('ollama')
  })
})
