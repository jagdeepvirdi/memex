import { activeEmbedding, getThresholdOverrides } from './embeddingConfig.js'

// How similar is "similar enough", per embedding model.
//
// A cosine score means different things in different models: nomic-embed-text scores unrelated notes around 0.5, while
// gemini-embedding-001 scores them around 0.68 (and its near-duplicates around 0.98). One fixed threshold per feature is
// therefore wrong for every model but the one it was tuned on, so each model has a profile:
//   duplicate  "this is probably the same note saved twice" (advisory hint when saving)
//   graph      "related enough to draw a line between them" (null: draw no semantic links)
//   entity     "same person/place, safe to auto-merge" (null: never auto-merge; merging is destructive)
//
// `basis` says how far to trust the numbers:
//   tuned    set by hand for this model against real use (nomic-embed-text)
//   probe    measured on a small synthetic set (see PROFILE_NOTES): a reasonable start, not tuned to a library
//   library  calibrated from the user's own library (scripts/calibrateEmbedding.ts) and stored in settings
//   default  nothing is known about this model: strict duplicates, no graph links, no auto-merge

export type ProfileBasis = 'tuned' | 'probe' | 'library' | 'default'

export interface SimilarityProfile {
  duplicate: number
  graph: number | null
  entity: number | null
  basis: ProfileBasis
}

export interface ThresholdOverride {
  duplicate?: number
  graph?: number | null
  entity?: number | null
}

export const BUILT_IN_PROFILES: Record<string, SimilarityProfile> = {
  'ollama:nomic-embed-text': { duplicate: 0.92, graph: 0.85, entity: 0.92, basis: 'tuned' },
  // Entity names are never embedded by a cloud model, so there is nothing to auto-merge (entity: null).
  'gemini:gemini-embedding-001': { duplicate: 0.94, graph: 0.80, entity: null, basis: 'probe' },
}

/** For a model nobody has measured: flag only near-identical notes, draw no links, merge nothing. */
export const FALLBACK_PROFILE: SimilarityProfile = { duplicate: 0.97, graph: null, entity: null, basis: 'default' }

/** What the built-in numbers rest on, shown by the calibration script. */
export const PROFILE_NOTES: Record<string, string> = {
  'ollama:nomic-embed-text': 'tuned by hand while building Memex',
  'gemini:gemini-embedding-001':
    'synthetic probe, 2026-11-17 (768 dims, document task type): near-duplicates 0.971-0.994, same topic but a different note 0.796-0.870, unrelated 0.610-0.753; duplicate sits between the last two groups (biased high), graph just above the unrelated maximum',
}

const MIN = { duplicate: 0.5, graph: 0.3, entity: 0.5 }
const MAX = 0.9999

const inRange = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= MAX

/**
 * Reads the per-model overrides from settings (`embedding_thresholds`: `{ "<provider>:<model>": { duplicate, graph, entity } }`).
 * Anything malformed is ignored field by field, so a bad value can never turn a threshold into NaN or 0 (which would
 * flag everything as a duplicate or merge unrelated entities).
 */
export function parseThresholdOverride(raw: unknown): ThresholdOverride {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const out: ThresholdOverride = {}
  if (inRange(r.duplicate, MIN.duplicate)) out.duplicate = r.duplicate
  if (r.graph === null || inRange(r.graph, MIN.graph)) out.graph = r.graph as number | null
  if (r.entity === null || inRange(r.entity, MIN.entity)) out.entity = r.entity as number | null
  return out
}

/** The profile for an embedding model id (`<provider>:<model>`), with the user's own calibration applied on top. */
export function profileFor(id: string, overrides: Record<string, unknown> = getThresholdOverrides()): SimilarityProfile {
  const base = BUILT_IN_PROFILES[id] ?? FALLBACK_PROFILE
  const o = parseThresholdOverride(overrides[id])
  if (Object.keys(o).length === 0) return { ...base }
  return {
    duplicate: o.duplicate ?? base.duplicate,
    graph: o.graph !== undefined ? o.graph : base.graph,
    entity: o.entity !== undefined ? o.entity : base.entity,
    basis: 'library',
  }
}

/** The profile of the embedding model that is active right now. */
export function activeProfile(): SimilarityProfile {
  return profileFor(activeEmbedding().id)
}
