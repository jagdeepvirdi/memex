import { describe, it, expect, afterEach } from 'vitest'
import {
  profileFor, activeProfile, parseThresholdOverride, BUILT_IN_PROFILES, FALLBACK_PROFILE, PROFILE_NOTES,
} from './embeddingProfiles'
import { setActiveEmbedding, buildEmbedding, setThresholdOverrides } from './embeddingConfig'

afterEach(() => {
  setActiveEmbedding(null)
  setThresholdOverrides(null)
})

describe('built-in profiles', () => {
  it('keeps the numbers nomic-embed-text was tuned with', () => {
    expect(profileFor('ollama:nomic-embed-text', {})).toEqual({ duplicate: 0.92, graph: 0.85, entity: 0.92, basis: 'tuned' })
  })

  it('has its own, higher duplicate threshold and lower graph threshold for gemini-embedding-001', () => {
    const g = profileFor('gemini:gemini-embedding-001', {})
    expect(g).toEqual({ duplicate: 0.94, graph: 0.8, entity: null, basis: 'probe' })
    // Measured on a synthetic set: near-duplicates 0.971+, same topic <= 0.870, unrelated <= 0.753.
    expect(g.duplicate).toBeGreaterThan(0.87)
    expect(g.duplicate).toBeLessThan(0.971)
    expect(g.graph!).toBeGreaterThan(0.753)
    expect(g.graph!).toBeLessThan(g.duplicate)
  })

  it('never auto-merges entities under a cloud model: cloud models never see entity names', () => {
    for (const [id, p] of Object.entries(BUILT_IN_PROFILES)) if (!id.startsWith('ollama:')) expect(p.entity).toBeNull()
  })

  it('explains what each built-in number rests on', () => {
    for (const id of Object.keys(BUILT_IN_PROFILES)) expect(PROFILE_NOTES[id]).toEqual(expect.any(String))
  })

  it('is strict for a model nobody has measured: near-identical only, no links, no merges', () => {
    for (const id of ['openai:text-embedding-3-small', 'ollama:mxbai-embed-large', 'gemini:gemini-embedding-2']) {
      expect(profileFor(id, {})).toEqual(FALLBACK_PROFILE)
    }
    expect(FALLBACK_PROFILE).toEqual({ duplicate: 0.97, graph: null, entity: null, basis: 'default' })
  })

  it('returns a copy, so a caller cannot change the built-in numbers', () => {
    const p = profileFor('ollama:nomic-embed-text', {})
    p.duplicate = 0.1
    expect(profileFor('ollama:nomic-embed-text', {}).duplicate).toBe(0.92)
  })
})

describe('calibrated overrides', () => {
  it('apply on top of the built-in numbers and mark the profile as calibrated for the library', () => {
    const p = profileFor('gemini:gemini-embedding-001', { 'gemini:gemini-embedding-001': { duplicate: 0.955, graph: 0.83 } })
    expect(p).toEqual({ duplicate: 0.955, graph: 0.83, entity: null, basis: 'library' })
  })

  it('only change the fields they set', () => {
    const p = profileFor('ollama:nomic-embed-text', { 'ollama:nomic-embed-text': { graph: 0.88 } })
    expect(p).toEqual({ duplicate: 0.92, graph: 0.88, entity: 0.92, basis: 'library' })
  })

  it('can switch a threshold off with null (no links, no auto-merge)', () => {
    const p = profileFor('ollama:nomic-embed-text', { 'ollama:nomic-embed-text': { graph: null, entity: null } })
    expect(p).toMatchObject({ graph: null, entity: null, duplicate: 0.92 })
  })

  it('can give an unmeasured model real thresholds', () => {
    const p = profileFor('openai:text-embedding-3-small', { 'openai:text-embedding-3-small': { duplicate: 0.9, graph: 0.6 } })
    expect(p).toEqual({ duplicate: 0.9, graph: 0.6, entity: null, basis: 'library' })
  })

  it('apply only to the model they name', () => {
    const o = { 'gemini:gemini-embedding-001': { duplicate: 0.99 } }
    expect(profileFor('ollama:nomic-embed-text', o).duplicate).toBe(0.92)
  })

  it('are read from the cached overrides by default', () => {
    setThresholdOverrides({ 'ollama:nomic-embed-text': { duplicate: 0.95 } })
    expect(profileFor('ollama:nomic-embed-text').duplicate).toBe(0.95)
    expect(activeProfile().duplicate).toBe(0.95)
  })
})

describe('parseThresholdOverride', () => {
  it.each([
    ['a duplicate threshold of 0 (would flag everything)', { duplicate: 0 }],
    ['a negative number', { duplicate: -0.5, graph: -1 }],
    ['a number above 1', { duplicate: 1.2 }],
    ['exactly 1', { duplicate: 1 }],
    ['NaN', { duplicate: Number.NaN, graph: Number.NaN }],
    ['Infinity', { duplicate: Infinity }],
    ['strings', { duplicate: '0.9', graph: '0.8', entity: '0.9' }],
    ['a threshold too low to mean anything', { duplicate: 0.4, graph: 0.2, entity: 0.3 }],
    ['undefined fields', { duplicate: undefined }],
  ])('ignores %s', (_n, raw) => {
    expect(parseThresholdOverride(raw)).toEqual({})
  })

  it.each([null, undefined, 42, 'x', [], [0.9]])('ignores a non-object (%j)', (raw) => {
    expect(parseThresholdOverride(raw)).toEqual({})
  })

  it('keeps the valid fields and drops the invalid ones', () => {
    expect(parseThresholdOverride({ duplicate: 0.96, graph: 'bad', entity: null })).toEqual({ duplicate: 0.96, entity: null })
  })

  it('a malformed override never changes the profile', () => {
    expect(profileFor('ollama:nomic-embed-text', { 'ollama:nomic-embed-text': { duplicate: 0, graph: Number.NaN } }))
      .toEqual(profileFor('ollama:nomic-embed-text', {}))
  })
})

describe('activeProfile', () => {
  it('follows the active embedding model', () => {
    expect(activeProfile().basis).toBe('tuned')
    setActiveEmbedding(buildEmbedding('gemini'))
    expect(activeProfile()).toMatchObject({ duplicate: 0.94, basis: 'probe' })
    setActiveEmbedding(buildEmbedding('openai'))
    expect(activeProfile()).toEqual(FALLBACK_PROFILE)
  })
})
