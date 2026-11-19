import { describe, it, expect } from 'vitest'
import { NOTES, QUERIES } from './retrievalFixture'
import { firstRelevantRank, scoreBenchmark, hashedEmbedding } from './retrievalMetrics'

describe('retrieval benchmark fixture', () => {
  it('has unique note ids and every relevant id exists', () => {
    const ids = NOTES.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const q of QUERIES) for (const id of q.relevant) expect(ids).toContain(id)
  })

  it('labels answerable and unanswerable queries consistently', () => {
    for (const q of QUERIES) {
      if (q.kind === 'none') expect(q.relevant).toHaveLength(0)
      else expect(q.relevant.length).toBeGreaterThan(0)
    }
    expect(QUERIES.some((q) => q.kind === 'none')).toBe(true)
  })

  it('stays synthetic: no email addresses, urls or long digit runs', () => {
    const all = NOTES.map((n) => `${n.title} ${n.content}`).join(' ') + QUERIES.map((q) => q.query).join(' ')
    expect(all).not.toMatch(/@|https?:\/\/|\d{6,}/)
  })
})

describe('scoring', () => {
  it('finds the 1-based rank of the first relevant id', () => {
    expect(firstRelevantRank(['a', 'b', 'c'], ['c'])).toBe(3)
    expect(firstRelevantRank(['a', 'b'], ['x'])).toBe(0)
  })

  it('computes hit rates, MRR and the unanswerable count', () => {
    const queries = [
      { query: 'q1', kind: 'exact' as const, relevant: ['a'] },
      { query: 'q2', kind: 'partial' as const, relevant: ['b'] },
      { query: 'q3', kind: 'exact' as const, relevant: ['c'] },
      { query: 'q4', kind: 'none' as const, relevant: [] },
    ]
    const rankings = new Map([
      ['q1', ['a', 'x']],
      ['q2', ['x', 'y', 'b']],
      ['q3', ['x', 'y', 'z', 'w', 'v']],
      ['q4', ['x']],
    ])
    const s = scoreBenchmark(queries, rankings)
    expect(s.answerable).toBe(3)
    expect(s.hitAt1).toBeCloseTo(1 / 3)
    expect(s.hitAt3).toBeCloseTo(2 / 3)
    expect(s.hitAt5).toBeCloseTo(2 / 3)
    expect(s.mrr).toBeCloseTo((1 + 1 / 3 + 0) / 3)
    expect(s.unanswerable).toBe(1)
    expect(s.unanswerableReturned).toBe(1)
    expect(s.misses.map((m) => m.query)).toEqual(['q3'])
  })
})

describe('hashedEmbedding', () => {
  it('is deterministic, 768-d and unit length', () => {
    const a = hashedEmbedding('olive oil cake')
    expect(a).toHaveLength(768)
    expect(a).toEqual(hashedEmbedding('olive oil cake'))
    expect(Math.sqrt(a.reduce((s, v) => s + v * v, 0))).toBeCloseTo(1)
  })

  it('puts related text closer than unrelated text', () => {
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0)
    const q = hashedEmbedding('lentil soup with cumin')
    expect(dot(q, hashedEmbedding('Simmer red lentils with cumin and garlic'))).toBeGreaterThan(
      dot(q, hashedEmbedding('Replace the worn washer and tighten the valve')),
    )
  })
})
