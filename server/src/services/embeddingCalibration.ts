import type { Pool } from 'pg'
import { pool } from '../db/client.js'
import logger from '../lib/logger.js'
import { profileFor, type SimilarityProfile, type ThresholdOverride } from './embeddingProfiles.js'

// Calibrating similarity thresholds for an embedding model from the user's own library.
//
// There is no ground truth ("these two notes ARE duplicates"), so the method is EQUIVALENT STRICTNESS: take a model whose
// thresholds you trust (nomic-embed-text, tuned by hand), measure what share of item pairs in your library its thresholds
// flag, then pick the thresholds for the new model that flag the same share of the same library. Different models score
// the same pair differently, but they rank pairs in roughly the same order, so "the top 0.03% most similar pairs" means
// about the same thing in both.
//
// An item has only ONE vector, so once the library is re-embedded the old model's vectors are gone. The reference share
// therefore has to be saved BEFORE switching (`embedding_calibration_reference` in settings); switching models does this
// automatically when it can (see `snapshotReference`).
//
// Only numbers are ever read out of the library here: no titles, no content.

/** Fewer pairs than this and a share like 0.03% is a single pair: no suggestion is made. */
export const MIN_PAIRS = 5000
/** Never read more than this many vectors (all pairs of 800 items is ~320k comparisons). */
export const DEFAULT_SAMPLE = 800
/** A reference needs at least this many vectors. */
export const MIN_ITEMS_FOR_REFERENCE = 50

export interface ReferenceFractions {
  /** Share of item pairs above the duplicate threshold (null: that threshold is switched off). */
  duplicate: number | null
  graph: number | null
}

export interface StoredReference {
  model: string
  items: number
  pairs: number
  fractions: ReferenceFractions
  savedAt: string
}

export interface Suggestion {
  duplicate: number | null
  graph: number | null
  /** Why a value is missing or was not changed. */
  notes: string[]
}

// ── Maths ────────────────────────────────────────────────────────────────────

/** Parses pgvector's text form: "[0.1,0.2,...]". */
export function parseVector(text: string): number[] {
  const v = JSON.parse(text) as unknown
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) throw new Error('Not a vector')
  return v
}

/** Cosine similarity of every pair (upper triangle), sorted ascending. */
export function sortedPairSimilarities(vectors: number[][]): Float64Array {
  const n = vectors.length
  const norms = vectors.map((v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)))
  const out = new Float64Array((n * (n - 1)) / 2)
  let k = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = vectors[i]
      const b = vectors[j]
      let dot = 0
      for (let d = 0; d < a.length; d++) dot += a[d] * b[d]
      const denom = norms[i] * norms[j]
      out[k++] = denom === 0 ? 0 : dot / denom
    }
  }
  out.sort()
  return out
}

/** The value below which `p` (0-1) of the pairs fall. */
export function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return NaN
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[idx]
}

/** Share (0-1) of pairs with a similarity strictly greater than `t`. */
export function fractionAbove(sorted: Float64Array, t: number): number {
  if (sorted.length === 0) return 0
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] > t) hi = mid
    else lo = mid + 1
  }
  return (sorted.length - lo) / sorted.length
}

/**
 * The threshold that leaves about `fraction` of the pairs strictly above it, rounded UP to 4 decimals so it never flags
 * more pairs than asked for. Null when that share is less than one whole pair.
 */
export function thresholdForFraction(sorted: Float64Array, fraction: number): number | null {
  const k = Math.round(fraction * sorted.length)
  if (k < 1 || k >= sorted.length) return null
  return Math.ceil(sorted[sorted.length - k - 1] * 1e4) / 1e4
}

/** What share of this library's pairs a profile's thresholds flag. */
export function referenceFractions(sorted: Float64Array, profile: Pick<SimilarityProfile, 'duplicate' | 'graph'>): ReferenceFractions {
  return {
    duplicate: fractionAbove(sorted, profile.duplicate),
    graph: profile.graph === null ? null : fractionAbove(sorted, profile.graph),
  }
}

/** Thresholds for the model behind `target` that flag the same share of the library as the reference did. */
export function suggestThresholds(target: Float64Array, reference: ReferenceFractions): Suggestion {
  const notes: string[] = []
  if (target.length < MIN_PAIRS) {
    const items = Math.ceil((1 + Math.sqrt(1 + 8 * MIN_PAIRS)) / 2)
    return { duplicate: null, graph: null, notes: [`Only ${target.length} item pairs: need at least ${MIN_PAIRS} (about ${items} items) for a meaningful suggestion.`] }
  }
  const one = (name: 'duplicate' | 'graph', share: number | null): number | null => {
    if (share === null) { notes.push(`The reference had no ${name} threshold, so none is suggested.`); return null }
    if (share === 0) { notes.push(`No pairs in the reference library were above its ${name} threshold, so there is nothing to match: the current ${name} threshold is kept.`); return null }
    const t = thresholdForFraction(target, share)
    if (t === null) { notes.push(`The reference flagged ${(share * 100).toFixed(4)}% of pairs, which is less than one pair here: the current ${name} threshold is kept.`); return null }
    return t
  }
  return { duplicate: one('duplicate', reference.duplicate), graph: one('graph', reference.graph), notes }
}

// ── Database ─────────────────────────────────────────────────────────────────

type Db = Pick<Pool, 'query'>

/** Vectors made by `modelId`, as numbers. Random sample of at most `limit` live, unencrypted items. */
export async function loadSampleVectors(modelId: string, limit = DEFAULT_SAMPLE, db: Db = pool): Promise<number[][]> {
  const { rows } = await db.query<{ v: string }>(
    `SELECT embedding::text AS v FROM items
     WHERE deleted_at IS NULL AND encrypted = false AND embedding IS NOT NULL AND embedding_model = $1
     ORDER BY random() LIMIT $2`,
    [modelId, limit],
  )
  return rows.map((r) => parseVector(r.v))
}

export async function readReference(db: Db = pool): Promise<StoredReference | null> {
  const { rows } = await db.query<{ value: unknown }>("SELECT value FROM settings WHERE key = 'embedding_calibration_reference'")
  const v = rows[0]?.value as Partial<StoredReference> | undefined
  if (!v || typeof v !== 'object' || typeof v.model !== 'string' || !v.fractions || typeof v.pairs !== 'number') return null
  return v as StoredReference
}

async function writeSetting(key: string, value: unknown, db: Db): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  )
}

export async function saveReference(ref: StoredReference, db: Db = pool): Promise<void> {
  await writeSetting('embedding_calibration_reference', ref, db)
}

/** Measures the library under `modelId` with its current thresholds and returns the reference to store (or null if too small). */
export async function measureReference(modelId: string, db: Db = pool, sample = DEFAULT_SAMPLE): Promise<StoredReference | null> {
  const vectors = await loadSampleVectors(modelId, sample, db)
  if (vectors.length < MIN_ITEMS_FOR_REFERENCE) return null
  const sims = sortedPairSimilarities(vectors)
  return {
    model: modelId,
    items: vectors.length,
    pairs: sims.length,
    fractions: referenceFractions(sims, profileFor(modelId)),
    savedAt: new Date().toISOString(),
  }
}

/**
 * Called just before the active model is switched away from `modelId`: saves the reference share while the vectors still
 * exist, unless one is already stored or the model's thresholds are not ones to copy (only tuned or library-calibrated
 * profiles qualify). Best effort: it never blocks a switch.
 */
export async function snapshotReference(modelId: string, db: Db = pool): Promise<'saved' | 'kept' | 'skipped'> {
  try {
    const basis = profileFor(modelId).basis
    if (basis !== 'tuned' && basis !== 'library') return 'skipped'
    if (await readReference(db)) return 'kept'
    const ref = await measureReference(modelId, db)
    if (!ref) return 'skipped'
    await saveReference(ref, db)
    return 'saved'
  } catch (err) {
    logger.warn({ err }, 'Could not save the calibration reference before switching models')
    return 'skipped'
  }
}

/** Stores calibrated thresholds for one model, keeping any other models' overrides. */
export async function applyThresholds(modelId: string, values: ThresholdOverride, db: Db = pool): Promise<Record<string, unknown>> {
  const { rows } = await db.query<{ value: unknown }>("SELECT value FROM settings WHERE key = 'embedding_thresholds'")
  const stored = rows[0]?.value
  const current = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {}
  const previous = current[modelId] && typeof current[modelId] === 'object' ? (current[modelId] as object) : {}
  const next = { ...current, [modelId]: { ...previous, ...values } }
  await writeSetting('embedding_thresholds', next, db)
  return next
}
