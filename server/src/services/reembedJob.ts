// Re-embeds the library with the active embedding model, as a background job.
//
// This is the one place that sends library text to a cloud embedding provider in bulk, so it only runs after the
// user confirmed an estimate (see the route). Properties worth keeping:
//   - resumable: it only picks up items whose vector is missing or from another model, so a cancelled or failed run
//     simply continues next time; items already done are never repeated;
//   - private items are skipped by the single writer (`embedAndStoreItemDetailed` checks `cloudSafe`);
//   - gentle: a few calls at a time, and the provider call itself backs off on rate limits (`aiEmbed`);
//   - honest: it stops at once on a blocked provider or a bad key, and after repeated failures, with a readable
//     message instead of grinding through thousands of doomed calls;
//   - cancellable: the user's Cancel aborts the in-flight calls and nothing half-written is left behind.

import { pool } from '../db/client.js'
import logger from '../lib/logger.js'
import { aiEmbed, AiProviderError } from './ai.js'
import { describeActionError } from './actionErrors.js'
import { embedAndStoreItemDetailed } from './embeddingService.js'
import { activeEmbedding, type ActiveEmbedding } from './embeddingConfig.js'
import { reportJobProgress, completeJob, failJob, cancelJob } from './ingestJobs.js'
import { registerJobAbort, unregisterJob } from './jobControl.js'
import { REEMBED_JOB_KIND } from './actionJobs.js'

export { REEMBED_JOB_KIND }

const BATCH_SIZE = 20
const CONCURRENCY = 3
/** Stop after this many failures in a row (the provider is down or the key is bad). */
const MAX_CONSECUTIVE_FAILURES = 5
/** Hard stop for one run; the job is resumable, so a very large library just takes another run. */
export const REEMBED_JOB_TIMEOUT_MS = 6 * 60 * 60_000
const FIRST_ID = '00000000-0000-0000-0000-000000000000'

/** What the job row's `details` carry, for the UI. */
export interface ReembedJobDetails {
  target: string
  stage: 'items' | 'entities'
  embedded: number
  skippedPrivate: number
  /** Items that could not be embedded this run (they are retried next run). */
  failures: number
}

export interface ReembedJobInput {
  jobId: string
  target: ActiveEmbedding
}

/** Items still needing a vector from `target`: missing or from another model, never skipped, never encrypted. */
const ITEM_FILTER = `deleted_at IS NULL AND encrypted = false AND type <> 'password' AND embedding_skip IS NULL
                     AND (embedding IS NULL OR embedding_model IS DISTINCT FROM $1)`
const ENTITY_FILTER = `(embedding IS NULL OR embedding_model IS DISTINCT FROM $1)`

class StopJob extends Error {}

/** A failure that no amount of retrying will fix: the provider is blocked, or rejected the key. */
function isFatal(err: unknown): boolean {
  return err instanceof AiProviderError && (err.kind === 'blocked' || err.kind === 'auth')
}

export async function runReembedJob({ jobId, target }: ReembedJobInput): Promise<void> {
  const control = registerJobAbort(jobId)
  const signal = AbortSignal.any([control.signal, AbortSignal.timeout(REEMBED_JOB_TIMEOUT_MS)])
  const details: ReembedJobDetails = { target: target.id, stage: 'items', embedded: 0, skippedPrivate: 0, failures: 0 }
  let done = 0
  let total = 0
  let consecutiveFailures = 0

  /** Records one finished item and stops the whole job when failures say there is no point going on. */
  const settle = (outcome: 'embedded' | 'skipped' | 'failed', error?: unknown) => {
    done++
    if (outcome === 'embedded') { details.embedded++; consecutiveFailures = 0 }
    else if (outcome === 'skipped') { details.skippedPrivate++; consecutiveFailures = 0 }
    else {
      details.failures++
      if (isFatal(error) || ++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw error ?? new Error('Embedding failed repeatedly')
    }
  }
  // Progress is a courtesy: a failed write must not stop the job.
  const progress = () => reportJobProgress(jobId, done, total, details).catch(() => {})

  try {
    // The job embeds into the model that is active now; the route guarantees `target` is that model and refuses to
    // switch while a job runs, so the two cannot drift apart mid-run.
    if (activeEmbedding().id !== target.id) throw new StopJob('The embedding model was changed. Start the re-embed again.')

    const local = target.provider === 'ollama'
    const itemCount = Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM items WHERE ${ITEM_FILTER}`, [target.id])).rows[0].n)
    const entityCount = local
      ? Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM entities WHERE ${ENTITY_FILTER}`, [target.id])).rows[0].n)
      : 0
    total = itemCount + entityCount
    await progress()

    // ── items, in id order so a failed item is not retried within the same run ──
    let lastId = FIRST_ID
    while (!signal.aborted) {
      const { rows } = await pool.query<{ id: string; title: string; content: string }>(
        `SELECT id, title, content FROM items WHERE ${ITEM_FILTER} AND id > $2 ORDER BY id LIMIT ${BATCH_SIZE}`,
        [target.id, lastId],
      )
      if (rows.length === 0) break
      for (let i = 0; i < rows.length && !signal.aborted; i += CONCURRENCY) {
        const results = await Promise.all(rows.slice(i, i + CONCURRENCY).map(r => embedAndStoreItemDetailed(r, target, signal)))
        for (const r of results) if (!signal.aborted) settle(r.outcome, r.error)
      }
      lastId = rows[rows.length - 1].id
      await progress()
    }

    // ── entity names: local model only. A cloud model never sees them, because an entity does not know whether the
    //    item it came from was private. ──
    if (local && !signal.aborted) {
      details.stage = 'entities'
      let lastEntity = FIRST_ID
      while (!signal.aborted) {
        const { rows } = await pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM entities WHERE ${ENTITY_FILTER} AND id > $2 ORDER BY id LIMIT ${BATCH_SIZE}`,
          [target.id, lastEntity],
        )
        if (rows.length === 0) break
        for (const row of rows) {
          if (signal.aborted) break
          try {
            const vector = await aiEmbed(row.name, { kind: 'query', signal })
            await pool.query('UPDATE entities SET embedding = $1, embedding_model = $2 WHERE id = $3', [JSON.stringify(vector), target.id, row.id])
            settle('embedded')
          } catch (err) {
            if (!signal.aborted) settle('failed', err)
          }
        }
        lastEntity = rows[rows.length - 1].id
        await progress()
      }
    }

    if (control.signal.aborted) {
      await cancelJob(jobId, details).catch(() => {})
      return
    }
    await completeJob(jobId, details)
  } catch (err) {
    // A user cancel surfaces as an aborted call: that is not a failure.
    if (control.signal.aborted) {
      await cancelJob(jobId, details).catch(() => {})
      return
    }
    const known = describeActionError(err)
    const message = err instanceof StopJob
      ? err.message
      : known?.message
        ?? (err instanceof Error && err.name === 'TimeoutError'
          ? 'Re-embedding hit its time limit and was stopped. Start it again to continue where it left off.'
          : `Re-embedding stopped after repeated failures${err instanceof Error ? `: ${err.message}` : ''}. Start it again to continue where it left off.`)
    if (!known && !(err instanceof StopJob)) logger.error(err, `Re-embed job ${jobId} failed`)
    await failJob(jobId, message, { ...details, ...(known?.kind ? { kind: known.kind } : {}) }).catch(() => {})
  } finally {
    unregisterJob(jobId)
  }
}
