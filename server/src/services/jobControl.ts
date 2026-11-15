// Stopping a running AI job.
//
// A job runs inside this server process, so cancelling it means aborting the AbortController its runner is
// listening to (the model call is cancelled mid-flight, and nothing is saved afterwards). The registry lives in
// memory on purpose: after a server restart there is no runner left to stop, and cancelling such an orphaned
// job just clears its row (see the cancel route).

import { AI_JOB_KINDS } from './actionJobs.js'

const running = new Map<string, AbortController>()

/** Called by a runner when it starts; the returned controller's signal should be passed to the model calls. */
export function registerJobAbort(jobId: string): AbortController {
  const controller = new AbortController()
  running.set(jobId, controller)
  return controller
}

/** Called by a runner when it ends, whatever the outcome. */
export function unregisterJob(jobId: string): void {
  running.delete(jobId)
}

/** Asks the runner of this job to stop. Returns false when no runner in this process is working on it. */
export function cancelRunningJob(jobId: string): boolean {
  const controller = running.get(jobId)
  if (!controller) return false
  controller.abort()
  return true
}

/** Only the AI jobs can be stopped; imports and backfills have their own lifecycle. */
export function isCancellableJobKind(kind: unknown): boolean {
  return typeof kind === 'string' && (AI_JOB_KINDS as readonly string[]).includes(kind)
}

/** For tests and diagnostics. */
export function runningJobCount(): number {
  return running.size
}
