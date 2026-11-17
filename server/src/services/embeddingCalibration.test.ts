import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('../lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  parseVector, sortedPairSimilarities, percentile, fractionAbove, thresholdForFraction, referenceFractions, suggestThresholds,
  loadSampleVectors, readReference, saveReference, measureReference, snapshotReference, applyThresholds,
  MIN_PAIRS, MIN_ITEMS_FOR_REFERENCE, type StoredReference,
} from './embeddingCalibration'
import { setThresholdOverrides } from './embeddingConfig'

const NOMIC = 'ollama:nomic-embed-text'
const sorted = (...xs: number[]) => Float64Array.from(xs).sort()
const rows = (...r: unknown[]) => ({ rows: r })
const fakeDb = (impl: (sql: string, params?: unknown[]) => unknown) => ({ query: vi.fn(async (sql: string, params?: unknown[]) => impl(String(sql), params)) }) as never

afterEach(() => setThresholdOverrides(null))

describe('parseVector', () => {
  it('reads pgvector text', () => expect(parseVector('[0.5,-1,2e-3]')).toEqual([0.5, -1, 0.002]))
  it.each(['not json', '{"a":1}', '[1,"x"]', '[1,null]', '"[1,2]"'])('rejects %s', (bad) => expect(() => parseVector(bad)).toThrow())
})

describe('sortedPairSimilarities', () => {
  it('compares every pair once, sorted ascending', () => {
    const s = sortedPairSimilarities([[1, 0], [0, 1], [1, 1], [-1, 0]])
    expect(s).toHaveLength(6)
    expect([...s]).toEqual([...s].sort((a, b) => a - b))
  })

  it('gives 1 for identical, 0 for orthogonal and -1 for opposite vectors', () => {
    expect([...sortedPairSimilarities([[1, 2], [1, 2]])]).toEqual([expect.closeTo(1, 10)])
    expect([...sortedPairSimilarities([[1, 0], [0, 1]])]).toEqual([expect.closeTo(0, 10)])
    expect([...sortedPairSimilarities([[1, 0], [-1, 0]])]).toEqual([expect.closeTo(-1, 10)])
  })

  it('ignores vector length, like the database does (cosine, not dot product)', () => {
    expect(sortedPairSimilarities([[1, 1], [50, 50]])[0]).toBeCloseTo(1, 10)
  })

  it('treats a zero vector as similar to nothing instead of producing NaN', () => {
    expect(sortedPairSimilarities([[0, 0], [1, 1]])[0]).toBe(0)
  })

  it('handles fewer than two vectors', () => {
    expect(sortedPairSimilarities([])).toHaveLength(0)
    expect(sortedPairSimilarities([[1, 2]])).toHaveLength(0)
  })
})

describe('percentile / fractionAbove', () => {
  const s = sorted(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)

  it('percentile finds the value below which p of the pairs fall', () => {
    expect(percentile(s, 0.5)).toBe(0.5)
    expect(percentile(s, 0.9)).toBe(0.9)
    expect(percentile(s, 1)).toBe(1.0)
    expect(percentile(s, 0)).toBe(0.1)
  })
  it('percentile of nothing is NaN', () => expect(percentile(sorted(), 0.5)).toBeNaN())

  it('fractionAbove counts pairs strictly above the threshold', () => {
    expect(fractionAbove(s, 0.5)).toBe(0.5)
    expect(fractionAbove(s, 0.95)).toBe(0.1)
    expect(fractionAbove(s, 1.0)).toBe(0)
    expect(fractionAbove(s, 0)).toBe(1)
  })
  it('fractionAbove of nothing is 0', () => expect(fractionAbove(sorted(), 0.5)).toBe(0))
})

describe('thresholdForFraction', () => {
  const s = sorted(...Array.from({ length: 1000 }, (_, i) => i / 1000)) // 0.000 ... 0.999

  it('returns a threshold that leaves about that share of pairs above it', () => {
    const t = thresholdForFraction(s, 0.05)!
    expect(fractionAbove(s, t)).toBeCloseTo(0.05, 2)
  })

  it('never flags more pairs than asked for (rounds the threshold up)', () => {
    const rough = sorted(0.123456, 0.2, 0.3, 0.4, 0.5, 0.60001, 0.7, 0.8, 0.9, 0.95)
    const t = thresholdForFraction(rough, 0.2)!
    expect([...rough].filter(x => x > t).length).toBeLessThanOrEqual(2)
    expect(t * 1e4).toBeCloseTo(Math.round(t * 1e4), 8) // 4 decimals
  })

  it('is null when the share is less than one whole pair', () => {
    expect(thresholdForFraction(s, 0.0001)).toBeNull()
    expect(thresholdForFraction(s, 0)).toBeNull()
  })

  it('is null when the share would be every pair', () => {
    expect(thresholdForFraction(s, 1)).toBeNull()
  })
})

describe('referenceFractions', () => {
  it('measures what share of pairs each threshold flags', () => {
    const s = sorted(0.1, 0.5, 0.86, 0.93, 0.99)
    expect(referenceFractions(s, { duplicate: 0.92, graph: 0.85 })).toEqual({ duplicate: 0.4, graph: 0.6 })
  })
  it('reports a switched-off graph threshold as null', () => {
    expect(referenceFractions(sorted(0.1, 0.99), { duplicate: 0.92, graph: null })).toEqual({ duplicate: 0.5, graph: null })
  })
})

describe('suggestThresholds — equivalent strictness', () => {
  // 3000 pairs in model A's scale; model B is the SAME pairs on another scale (a monotone transform of A's scores): its
  // unrelated pairs sit near 0.68 instead of 0.5, like gemini-embedding-001 versus nomic-embed-text.
  const N = 6000
  const a = sorted(...Array.from({ length: N }, (_, i) => 0.3 + 0.7 * (i / N) ** 3)) // mostly low, a heavy tail near 1
  const toB = (x: number) => 0.62 + 0.38 * ((x - 0.3) / 0.7)
  const b = Float64Array.from(a, toB)

  it('finds the threshold in the new model\'s scale that flags the same pairs the reference threshold did', () => {
    const ref = referenceFractions(a, { duplicate: 0.92, graph: 0.85 })
    const s = suggestThresholds(b, ref)
    expect(s.duplicate).toBeCloseTo(toB(0.92), 2)
    expect(s.graph).toBeCloseTo(toB(0.85), 2)
    expect(s.duplicate!).toBeGreaterThan(s.graph!)
    // and they flag (almost) the same share of pairs
    expect(fractionAbove(b, s.duplicate!)).toBeCloseTo(ref.duplicate!, 2)
  })

  it('does not simply copy the reference thresholds when the scale differs', () => {
    const s = suggestThresholds(b, referenceFractions(a, { duplicate: 0.92, graph: 0.85 }))
    expect(s.duplicate).not.toBeCloseTo(0.92, 2)
  })

  it('makes no suggestion from too few pairs', () => {
    const few = sorted(...Array.from({ length: MIN_PAIRS - 1 }, (_, i) => i / MIN_PAIRS))
    const s = suggestThresholds(few, { duplicate: 0.01, graph: 0.05 })
    expect(s.duplicate).toBeNull()
    expect(s.graph).toBeNull()
    expect(s.notes[0]).toMatch(/need at least 5000/)
  })

  it('keeps the current threshold when the reference flagged nothing (there is nothing to match)', () => {
    const s = suggestThresholds(b, { duplicate: 0, graph: 0.01 })
    expect(s.duplicate).toBeNull()
    expect(s.notes.join(' ')).toMatch(/nothing to match.*duplicate/)
    expect(s.graph).not.toBeNull()
  })

  it('keeps the current threshold when the share is less than one pair here', () => {
    const s = suggestThresholds(b, { duplicate: 1e-9, graph: null })
    expect(s.duplicate).toBeNull()
    expect(s.notes.join(' ')).toMatch(/less than one pair/)
  })

  it('suggests no graph threshold when the reference had none', () => {
    const s = suggestThresholds(b, { duplicate: 0.01, graph: null })
    expect(s.graph).toBeNull()
    expect(s.notes.join(' ')).toMatch(/no graph threshold/)
  })
})

describe('library access', () => {
  it('samples live, unencrypted items embedded by exactly that model, at random, up to the limit', async () => {
    const db = fakeDb(() => rows({ v: '[1,0]' }, { v: '[0,1]' }))
    expect(await loadSampleVectors(NOMIC, 50, db)).toEqual([[1, 0], [0, 1]])
    const [sql, params] = (db as unknown as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0]
    expect(sql).toMatch(/deleted_at IS NULL AND encrypted = false AND embedding IS NOT NULL AND embedding_model = \$1/)
    expect(sql).toMatch(/ORDER BY random\(\) LIMIT \$2/)
    expect(params).toEqual([NOMIC, 50])
  })

  it('selects only the vector, never a title or content', async () => {
    const db = fakeDb(() => rows())
    await loadSampleVectors(NOMIC, 10, db)
    const sql = String((db as unknown as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0][0])
    expect(sql).toMatch(/SELECT embedding::text AS v FROM items/)
    expect(sql).not.toMatch(/title|content/)
  })
})

describe('reference storage', () => {
  const REF: StoredReference = { model: NOMIC, items: 700, pairs: 244650, fractions: { duplicate: 0.003, graph: 0.005 }, savedAt: '2026-11-17T00:00:00.000Z' }

  it('reads a stored reference', async () => {
    expect(await readReference(fakeDb(() => rows({ value: REF })))).toEqual(REF)
  })

  it.each([
    ['none stored', rows()],
    ['a string', rows({ value: 'oops' })],
    ['a missing model', rows({ value: { ...REF, model: undefined } })],
    ['missing fractions', rows({ value: { ...REF, fractions: undefined } })],
    ['no pair count', rows({ value: { ...REF, pairs: 'many' } })],
  ])('treats %s as no reference', async (_n, result) => {
    expect(await readReference(fakeDb(() => result))).toBeNull()
  })

  it('saves it as JSON under its own settings key', async () => {
    const db = fakeDb(() => rows())
    await saveReference(REF, db)
    const [sql, params] = (db as unknown as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO settings.*ON CONFLICT \(key\) DO UPDATE/s)
    expect(params).toEqual(['embedding_calibration_reference', JSON.stringify(REF)])
  })
})

/** Vectors for `n` items whose cosine similarity is 1 within a group of `group` and about 0 between groups. */
function groupedVectors(n: number, group: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const v = new Array(64).fill(0)
    v[Math.floor(i / group) % 64] = 1
    v[63] += 0.001 * (i % 7) // tiny jitter so identical groups are not bit-identical
    return JSON.stringify(v)
  })
}

describe('measureReference', () => {
  it('is null when the library has too few vectors to say anything', async () => {
    expect(await measureReference(NOMIC, fakeDb(() => rows(...groupedVectors(MIN_ITEMS_FOR_REFERENCE - 1, 2).map(v => ({ v })))))).toBeNull()
  })

  it('measures what share of pairs the model\'s own thresholds flag', async () => {
    // 100 items in 50 pairs of near-identical vectors: 50 of 4950 pairs are above any duplicate threshold.
    const db = fakeDb(() => rows(...groupedVectors(100, 2).map(v => ({ v }))))
    const ref = (await measureReference(NOMIC, db))!
    expect(ref).toMatchObject({ model: NOMIC, items: 100, pairs: 4950 })
    expect(ref.fractions.duplicate).toBeCloseTo(50 / 4950, 4)
    expect(ref.fractions.graph).toBeCloseTo(50 / 4950, 4)
    expect(new Date(ref.savedAt).getTime()).not.toBeNaN()
  })
})

describe('snapshotReference', () => {
  const enough = () => rows(...groupedVectors(100, 2).map(v => ({ v })))
  const calls = (db: unknown) => (db as { query: ReturnType<typeof vi.fn> }).query.mock.calls.map(c => String(c[0]))

  it('saves the reference when the model being left has trusted thresholds and none is stored', async () => {
    const db = fakeDb((sql) => (/FROM settings/.test(sql) ? rows() : /FROM items/.test(sql) ? enough() : rows()))
    expect(await snapshotReference(NOMIC, db)).toBe('saved')
    expect(calls(db).some(s => /INSERT INTO settings/.test(s))).toBe(true)
  })

  it('keeps a reference that is already stored', async () => {
    const db = fakeDb((sql) => (/FROM settings/.test(sql) ? rows({ value: { model: NOMIC, pairs: 1, fractions: {} } }) : enough()))
    expect(await snapshotReference(NOMIC, db)).toBe('kept')
    expect(calls(db).some(s => /INSERT INTO settings/.test(s))).toBe(false)
  })

  it.each(['gemini:gemini-embedding-001', 'openai:text-embedding-3-small', 'ollama:unmeasured'])(
    'does not save a reference from %s: its thresholds are not ones to copy', async (id) => {
      const db = fakeDb(() => enough())
      expect(await snapshotReference(id, db)).toBe('skipped')
      expect(calls(db)).toEqual([]) // it does not even read the library
    },
  )

  it('does save one from a model the user calibrated', async () => {
    setThresholdOverrides({ 'ollama:unmeasured': { duplicate: 0.9 } })
    const db = fakeDb((sql) => (/FROM settings/.test(sql) ? rows() : /FROM items/.test(sql) ? enough() : rows()))
    expect(await snapshotReference('ollama:unmeasured', db)).toBe('saved')
  })

  it('skips quietly when the library has too few vectors', async () => {
    const db = fakeDb((sql) => (/FROM settings/.test(sql) ? rows() : rows(...groupedVectors(5, 1).map(v => ({ v })))))
    expect(await snapshotReference(NOMIC, db)).toBe('skipped')
    expect(calls(db).some(s => /INSERT INTO settings/.test(s))).toBe(false)
  })

  it('never throws: a database failure means skipped, so a model switch is never blocked', async () => {
    const db = fakeDb(() => { throw new Error('db down') })
    await expect(snapshotReference(NOMIC, db)).resolves.toBe('skipped')
  })
})

describe('applyThresholds', () => {
  const written = (db: unknown) => JSON.parse(String((db as { query: ReturnType<typeof vi.fn> }).query.mock.calls.at(-1)![1][1]))

  it('stores thresholds for the model under embedding_thresholds', async () => {
    const db = fakeDb((sql) => (/SELECT/.test(sql) ? rows() : rows()))
    const next = await applyThresholds('gemini:gemini-embedding-001', { duplicate: 0.955, graph: 0.83 }, db)
    expect(next).toEqual({ 'gemini:gemini-embedding-001': { duplicate: 0.955, graph: 0.83 } })
    expect((db as unknown as { query: ReturnType<typeof vi.fn> }).query.mock.calls.at(-1)![1][0]).toBe('embedding_thresholds')
  })

  it('keeps other models\' calibration and this model\'s other fields', async () => {
    const db = fakeDb((sql) => (/SELECT/.test(sql) ? rows({ value: { 'x:y': { duplicate: 0.9 }, 'gemini:gemini-embedding-001': { entity: null, graph: 0.7 } } }) : rows()))
    await applyThresholds('gemini:gemini-embedding-001', { duplicate: 0.96, graph: 0.83 }, db)
    expect(written(db)).toEqual({ 'x:y': { duplicate: 0.9 }, 'gemini:gemini-embedding-001': { entity: null, graph: 0.83, duplicate: 0.96 } })
  })

  it.each([['a string', 'oops'], ['an array', [1]], ['null', null]])('starts fresh when the stored value is %s', async (_n, bad) => {
    const db = fakeDb((sql) => (/SELECT/.test(sql) ? rows({ value: bad }) : rows()))
    await applyThresholds('a:b', { duplicate: 0.95 }, db)
    expect(written(db)).toEqual({ 'a:b': { duplicate: 0.95 } })
  })
})
