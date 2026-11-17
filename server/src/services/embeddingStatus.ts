import { pool } from '../db/client.js'
import { listProviders } from './ai.js'
import { getAiConfig } from './settings.js'
import { activeEmbedding, type ActiveEmbedding, type EmbeddingProvider } from './embeddingConfig.js'

import { REEMBED_JOB_KIND } from './actionJobs.js'
export { REEMBED_JOB_KIND }
/** A re-embed job still "processing" after this long is treated as dead (the server restarted mid-job). */
export const REEMBED_STALE_HOURS = 6

export interface EmbeddingStatus {
  provider: EmbeddingProvider
  model: string
  id: string
  cloud: boolean
  /** A key exists for the provider (always true for local Ollama). */
  configured: boolean
  /** Whether new vectors can be made right now, and if not, why (shown to the user, never contains a key). */
  usable: boolean
  blockedReason: string | null
  counts: {
    /** Items whose vector was made by the active model. */
    embedded: number
    /** Items with a vector from a different model: they are ignored by search until re-embedded. */
    needsReembed: number
    /** Items deliberately not embedded because they must not leave this machine. */
    skippedPrivate: number
    /** Items waiting for a vector (the background worker retries these). */
    pending: number
    total: number
  }
  /** The re-embed job that is running right now, if any (so the UI can follow it after a page reload). */
  job: { id: string; progress: number; completed: number; total: number } | null
}

/**
 * Why the active embedding model cannot make vectors right now, or null when it can. A cloud model follows the same
 * rules as chat: Strict Local off, cloud consent on, key set. Local Ollama is always "usable" here (whether Ollama is
 * actually running is a separate question).
 */
export async function embeddingBlockedReason(active: ActiveEmbedding = activeEmbedding()): Promise<string | null> {
  if (active.provider === 'ollama') return null
  const [config, providers] = await Promise.all([getAiConfig(), listProviders()])
  if (config.strictLocal) return 'Strict Local Mode is on, so semantic search is paused and keyword search is used'
  if (!config.allowCloud) return 'Cloud AI is not enabled in Settings'
  if (!(providers.find(p => p.id === active.provider)?.configured ?? false)) return `No API key is configured for ${active.provider}`
  return null
}

/** What the AI settings tab shows about embeddings. Counts only; no item text and no keys. */
export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const active = activeEmbedding()
  const cloud = active.provider !== 'ollama'
  const [blockedReason, providers, { rows }, jobs] = await Promise.all([
    embeddingBlockedReason(active),
    listProviders(),
    pool.query<Record<string, string>>(
      `SELECT count(*) FILTER (WHERE embedding IS NOT NULL AND embedding_model = $1) AS embedded,
              count(*) FILTER (WHERE embedding IS NOT NULL AND embedding_model IS DISTINCT FROM $1
                                 AND embedding_skip IS NULL) AS needs_reembed,
              count(*) FILTER (WHERE embedding_skip = 'private') AS skipped_private,
              count(*) FILTER (WHERE embedding IS NULL AND embedding_skip IS NULL) AS pending,
              count(*) AS total
       FROM items WHERE deleted_at IS NULL AND encrypted = false`,
      [active.id],
    ),
    pool.query<{ id: string; progress: number; completed: number; total: number }>(
      `SELECT id, progress, completed, total FROM ingest_jobs
       WHERE kind = $1 AND status = 'processing' AND started_at > NOW() - ($2 || ' hours')::interval
       ORDER BY started_at DESC LIMIT 1`,
      [REEMBED_JOB_KIND, String(REEMBED_STALE_HOURS)],
    ),
  ])
  const configured = !cloud || (providers.find(p => p.id === active.provider)?.configured ?? false)

  const r = rows[0] ?? {}
  const n = (k: string) => Number(r[k] ?? 0)
  const job = jobs.rows[0]
  return {
    provider: active.provider,
    model: active.model,
    id: active.id,
    cloud,
    configured,
    usable: blockedReason === null,
    blockedReason,
    counts: {
      embedded: n('embedded'), needsReembed: n('needs_reembed'), skippedPrivate: n('skipped_private'),
      pending: n('pending'), total: n('total'),
    },
    job: job ? { id: job.id, progress: job.progress, completed: job.completed, total: job.total } : null,
  }
}
