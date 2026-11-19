// Scoring for the retrieval benchmark (R9-02). Pure functions, so they are unit-tested in every normal test run.

import type { FixtureQuery } from './retrievalFixture.js'

/** Ids in the order retrieval returned them, for one query. */
export type Ranking = string[]

/** 1-based rank of the first relevant id, or 0 when none of them appears. */
export function firstRelevantRank(ranking: Ranking, relevant: string[]): number {
  const idx = ranking.findIndex((id) => relevant.includes(id))
  return idx === -1 ? 0 : idx + 1
}

export interface BenchmarkScore {
  /** Queries that have an answer (kind exact or partial). */
  answerable: number
  hitAt1: number
  hitAt3: number
  hitAt5: number
  /** Mean reciprocal rank over answerable queries (0 when a relevant note is missing from the results). */
  mrr: number
  /** Queries with no answer in the library, and how many of them still returned something. */
  unanswerable: number
  unanswerableReturned: number
  /** Answerable queries whose first relevant note was not in the top 3, for the report. */
  misses: { query: string; rank: number }[]
}

export function scoreBenchmark(
  queries: FixtureQuery[],
  rankings: Map<string, Ranking>,
): BenchmarkScore {
  let answerable = 0
  let h1 = 0
  let h3 = 0
  let h5 = 0
  let rr = 0
  let unanswerable = 0
  let unanswerableReturned = 0
  const misses: { query: string; rank: number }[] = []

  for (const q of queries) {
    const ranking = rankings.get(q.query) ?? []
    if (q.kind === 'none') {
      unanswerable += 1
      if (ranking.length > 0) unanswerableReturned += 1
      continue
    }
    answerable += 1
    const rank = firstRelevantRank(ranking, q.relevant)
    if (rank === 1) h1 += 1
    if (rank >= 1 && rank <= 3) h3 += 1
    if (rank >= 1 && rank <= 5) h5 += 1
    if (rank > 0) rr += 1 / rank
    if (rank === 0 || rank > 3) misses.push({ query: q.query, rank })
  }

  const share = (n: number) => (answerable === 0 ? 0 : n / answerable)
  return {
    answerable,
    hitAt1: share(h1),
    hitAt3: share(h3),
    hitAt5: share(h5),
    mrr: share(rr),
    unanswerable,
    unanswerableReturned,
    misses,
  }
}

/** A deterministic stand-in for an embedding model: hashed bag of words, L2-normalised, 768 dimensions. It measures the
 *  ranking SQL and weights, not model quality, and needs no network or model. Stop words are dropped. */
const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'which', 'where', 'who', 'are', 'was', 'has', 'have', 'does', 'from', 'that', 'this', 'your', 'into', 'about', 'after', 'before', 'than', 'then', 'them', 'their', 'will', 'can', 'out', 'any', 'all'])

function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function hashedEmbedding(text: string, dim = 768): number[] {
  const vec = new Array<number>(dim).fill(0)
  const tokens = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
  for (const raw of tokens) {
    if (STOP.has(raw)) continue
    // a crude stem so "exercises"/"exercise" and "tarts"/"tart" meet
    const token = raw.length > 4 ? raw.replace(/(ing|ed|es|s)$/, '') : raw
    vec[fnv1a(token) % dim] += 1
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return norm === 0 ? vec : vec.map((v) => v / norm)
}
