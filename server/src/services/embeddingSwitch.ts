import { pool } from '../db/client.js'
import { cloudSafe } from './cloudSafe.js'
import {
  activeEmbedding, buildEmbedding, loadEmbeddingConfig, type ActiveEmbedding,
} from './embeddingConfig.js'
import { snapshotReference } from './embeddingCalibration.js'
import { embeddingBlockedReason, REEMBED_JOB_KIND, REEMBED_STALE_HOURS } from './embeddingStatus.js'
import { hasRunningJob } from './ingestJobs.js'

// Switching the embedding model and re-embedding the library.
//
// Two steps on purpose, with the user's explicit confirmation between them:
//   1. estimate  — read-only: how many items, roughly how much text, how many private items stay home;
//   2. switch    — validated and consent-checked; changes which vectors search can see (old vectors are kept, so
//                  switching back is instant), but sends nothing anywhere;
//   3. re-embed  — a background job (reembedJob.ts); this is the only step that sends library text to a provider.

/** Same text cap the embedder applies. */
const MAX_EMBED_CHARS = 6000
/** Rough, provider-independent token estimate for English text. Shown as "about", never as a bill. */
const CHARS_PER_TOKEN = 4

export class EmbeddingSwitchError extends Error {
  constructor(public readonly status: 409, message: string) {
    super(message)
    this.name = 'EmbeddingSwitchError'
  }
}

export interface ReembedEstimate {
  target: { provider: ActiveEmbedding['provider']; model: string; id: string }
  cloud: boolean
  /** Items that would be embedded (and, for a cloud model, sent to the provider). */
  items: number
  characters: number
  approxTokens: number
  /** Items that must not leave this machine and so are not embedded under a cloud model. */
  skippedPrivate: number
  /** Items that already have a vector from the target model. */
  alreadyDone: number
  /** Entity names that would be embedded (local target only; cloud models never see entity names). */
  entities: number
  /** Set when the target cannot be used right now (no consent, no key, Strict Local); items would not be embedded. */
  blockedReason: string | null
}

interface CandidateRow {
  type: string
  chars: number
  categories: string[] | null
  tags: string[] | null
}

/** What switching to `target` and re-embedding would do. Reads the database only; nothing is sent anywhere. */
export async function estimateReembed(target: ActiveEmbedding): Promise<ReembedEstimate> {
  const cloud = target.provider !== 'ollama'

  const [candidates, done, skipped, entities, blockedReason] = await Promise.all([
    pool.query<CandidateRow>(
      `SELECT i.type,
              LEAST(length(i.title) + 2 + length(i.content), ${MAX_EMBED_CHARS}) AS chars,
              (SELECT array_agg(c.name ORDER BY ic.depth) FROM item_categories ic JOIN categories c ON c.id = ic.category_id WHERE ic.item_id = i.id) AS categories,
              (SELECT array_agg(t.name) FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id) AS tags
       FROM items i
       WHERE i.deleted_at IS NULL AND i.encrypted = false AND i.type <> 'password'
         AND (i.embedding_skip IS NULL OR $2::boolean = false)
         AND (i.embedding IS NULL OR i.embedding_model IS DISTINCT FROM $1)`,
      [target.id, cloud],
    ),
    pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM items WHERE deleted_at IS NULL AND encrypted = false AND embedding IS NOT NULL AND embedding_model = $1`,
      [target.id],
    ),
    // Already marked private: only meaningful for a cloud model (a local model embeds everything).
    cloud
      ? pool.query<{ n: string }>(`SELECT count(*) AS n FROM items WHERE deleted_at IS NULL AND encrypted = false AND embedding_skip = 'private'`)
      : Promise.resolve({ rows: [{ n: '0' }] }),
    cloud
      ? Promise.resolve({ rows: [{ n: '0' }] })
      : pool.query<{ n: string }>(
          `SELECT count(*) AS n FROM entities WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM $1`, [target.id]),
    embeddingBlockedReason(target),
  ])

  let items = 0
  let characters = 0
  let privateNow = 0
  for (const row of candidates.rows) {
    if (cloud && !cloudSafe({ type: row.type, encrypted: false, categories: row.categories, tags: row.tags })) {
      privateNow++
      continue
    }
    items++
    characters += Number(row.chars)
  }

  return {
    target: { provider: target.provider, model: target.model, id: target.id },
    cloud,
    items,
    characters,
    approxTokens: Math.ceil(characters / CHARS_PER_TOKEN),
    skippedPrivate: privateNow + Number(skipped.rows[0].n),
    alreadyDone: Number(done.rows[0].n),
    entities: Number(entities.rows[0].n),
    blockedReason,
  }
}

/** True while a re-embed job is running (a row older than the stale limit is a crashed job and is ignored). */
export function reembedRunning(): Promise<boolean> {
  return hasRunningJob(REEMBED_JOB_KIND, REEMBED_STALE_HOURS * 60)
}

/**
 * Makes `provider`/`model` the active embedding model. Refuses a cloud model that cannot be used yet (no consent, no
 * key, Strict Local Mode) and refuses to switch while a re-embed is running. Sends nothing and starts no job: until
 * the library is re-embedded, search uses the vectors it has for this model and keywords for the rest.
 */
export async function switchEmbeddingModel(provider: ActiveEmbedding['provider'], model?: string | null): Promise<ActiveEmbedding> {
  const target = buildEmbedding(provider, model)

  if (await reembedRunning()) {
    throw new EmbeddingSwitchError(409, 'A re-embed is running. Cancel it or wait for it to finish before switching models.')
  }
  const reason = await embeddingBlockedReason(target)
  if (reason) throw new EmbeddingSwitchError(409, reason)

  // Items keep only one vector, so once the library is re-embedded the model we are leaving is gone, and with it the
  // chance to measure what its similarity thresholds meant on this library. Save that now (best effort, never blocks).
  const leaving = activeEmbedding().id
  if (leaving !== target.id) await snapshotReference(leaving)

  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('embedding_provider', $1, NOW()), ('embedding_model', $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(target.provider), JSON.stringify(target.model)],
  )
  // A local model can embed anything, so items skipped as private for a cloud model are candidates again.
  if (target.provider === 'ollama') {
    await pool.query(`UPDATE items SET embedding_skip = NULL WHERE embedding_skip IS NOT NULL`)
  }
  return loadEmbeddingConfig()
}
