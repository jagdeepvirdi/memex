// Explain as a background job.
//
// A long video takes minutes on a local model, far too long to hold an HTTP request open (and a browser tab
// that is closed or navigated away would lose the work). The route validates, creates a job row and returns
// its id at once; this runner does the work, reports progress on the row (`GET /api/ingest/jobs/:id`), saves
// the explanation on the item, and records success or a readable failure. The result is saved even if nobody
// is watching.

import { pool } from '../db/client.js'
import { explainItem, type ExplainProgress } from './explainService.js'
import { describeActionError } from './actionErrors.js'
import { reportJobProgress, completeJob, failJob, cancelJob } from './ingestJobs.js'
import { registerJobAbort, unregisterJob } from './jobControl.js'
import logger from '../lib/logger.js'
import type { AiCallOptions } from './ai.js'
import { EXPLAIN_JOB_KIND, AI_JOB_STALE_MINUTES, AI_JOB_TIMEOUT_MS } from './actionJobs.js'

export { EXPLAIN_JOB_KIND }
export const EXPLAIN_JOB_STALE_MINUTES = AI_JOB_STALE_MINUTES
export const EXPLAIN_JOB_TIMEOUT_MS = AI_JOB_TIMEOUT_MS

export interface ExplainJobInput {
  jobId: string
  itemId: string
  title: string
  content: string
  sourceUrl: string | null
  provider?: AiCallOptions['provider']
  /** Result of cloudSafe(item); false pins the call to Ollama. */
  cloudSafe: boolean
}

/** What the job row's `details` carry while running, for the UI. */
export interface ExplainJobDetails {
  itemId: string
  stage?: ExplainProgress['stage']
  part?: number
  parts?: number
  model?: string
}

export async function runExplainJob(input: ExplainJobInput): Promise<void> {
  const { jobId, itemId } = input
  // The user can stop this job (POST /api/ingest/jobs/:id/cancel): that aborts `control`, which cancels the model call.
  const control = registerJobAbort(jobId)
  const signal = AbortSignal.any([control.signal, AbortSignal.timeout(EXPLAIN_JOB_TIMEOUT_MS)])
  try {
    const explanation = await explainItem(
      { title: input.title, content: input.content, sourceUrl: input.sourceUrl },
      {
        provider: input.provider,
        cloudSafe: input.cloudSafe,
        signal,
        onProgress: p => {
          const details: ExplainJobDetails = { itemId, stage: p.stage, part: p.part, parts: p.parts }
          // Progress is a courtesy: a failed write must not stop the explanation.
          reportJobProgress(jobId, p.done, p.total, details).catch(() => {})
        },
      },
    )

    // Cancelled just as it finished: honour the user's choice, save nothing.
    if (control.signal.aborted) {
      await cancelJob(jobId, { itemId } satisfies ExplainJobDetails).catch(() => {})
      return
    }

    await pool.query(
      `UPDATE items
         SET structured = jsonb_set(COALESCE(structured, '{}'::jsonb), '{explanation}', $1::jsonb),
             extraction_model = $2, updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL`,
      [JSON.stringify(explanation), explanation.model, itemId],
    )
    await completeJob(jobId, { itemId, model: explanation.model } satisfies ExplainJobDetails)
  } catch (err) {
    // A user cancel surfaces as an aborted call (an AbortError or a provider "timeout"): that is not a failure.
    if (control.signal.aborted) {
      await cancelJob(jobId, { itemId } satisfies ExplainJobDetails).catch(() => {})
      return
    }
    const known = describeActionError(err)
    if (!known) logger.error(err, `Explain job ${jobId} failed`)
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    const message = known?.message
      ?? (timedOut ? 'Explaining took too long and was stopped. Try again, or pick a faster provider.' : 'Failed to explain item')
    await failJob(jobId, message, { itemId, ...(known?.kind ? { kind: known.kind } : {}) }).catch(() => {})
  } finally {
    unregisterJob(jobId)
  }
}
