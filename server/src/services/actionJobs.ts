// Shared plumbing for on-demand AI actions that run as background jobs (Explain, Extract recipe).
//
// Both hit the same local model, so they share one rule — one AI job at a time — and the same limits.

import { v4 as uuidv4 } from 'uuid'
import { createJob, saveJobDetails, hasRunningJob } from './ingestJobs.js'

export const EXPLAIN_JOB_KIND = 'explain'
export const EXTRACT_RECIPE_JOB_KIND = 'extract-recipe'
export const AI_JOB_KINDS = [EXPLAIN_JOB_KIND, EXTRACT_RECIPE_JOB_KIND] as const
export type AiJobKind = (typeof AI_JOB_KINDS)[number]

/**
 * Re-embedding the library with another embedding model. Cancellable like the AI jobs above, but deliberately NOT in
 * AI_JOB_KINDS: it can run for much longer than their 20 minute / 15 minute limits, it is resumable, and it does not
 * compete with them for a local chat model. It has its own "one at a time" rule.
 */
export const REEMBED_JOB_KIND = 'reembed'

/** A job still "processing" after this long is treated as dead (the server restarted mid-job). */
export const AI_JOB_STALE_MINUTES = 20
/** Hard stop for one job. */
export const AI_JOB_TIMEOUT_MS = 15 * 60_000

/** True while any AI job (of any kind) is running. A local model runs them one after another anyway. */
export async function anotherAiJobRunning(): Promise<boolean> {
  for (const kind of AI_JOB_KINDS) {
    if (await hasRunningJob(kind, AI_JOB_STALE_MINUTES)) return true
  }
  return false
}

/** Creates the job row (remembering which item it is for) and returns its id. The caller then starts the work. */
export async function createAiJob(kind: AiJobKind, itemId: string): Promise<string> {
  const jobId = uuidv4()
  await createJob(jobId, 1, kind)
  await saveJobDetails(jobId, { itemId, stage: 'reading' }).catch(() => {})
  return jobId
}

export const AI_JOB_BUSY_MESSAGE = 'Another AI task is still running. Wait for it to finish.'
