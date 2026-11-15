import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fetchIngestJob } from '../../lib/api'
import type { IngestJobStatus } from '../../lib/api'
import type { ExplainRequest } from '../../../../shared/types'

const POLL_MS = 1500
/** Give up on a job whose status cannot be read this many times in a row (server down). */
const MAX_POLL_FAILURES = 5

export type ActionJobKind = 'explain' | 'extract-recipe'

export interface JobRun {
  running: boolean
  /** 0–100. */
  percent: number
  /** What it is doing right now, e.g. "Summarising part 3 of 6…". */
  label: string
}

const IDLE: JobRun = { running: false, percent: 0, label: '' }

/** Per-kind wording for failures the hook has to report itself. */
const MESSAGES: Record<ActionJobKind, { failed: string; couldNotShow: string }> = {
  'explain': {
    failed: 'Failed to explain',
    couldNotShow: 'The explanation finished, but the item could not be reloaded. Refresh the page.',
  },
  'extract-recipe': {
    failed: 'Failed to extract recipe',
    couldNotShow: 'The job finished, but the result could not be loaded. Refresh the page.',
  },
}
const LOST_CONTACT = 'Lost contact with the server while working. Check the item in a moment — it may still finish.'

/** Human wording for where a job has got to. */
export function describeJobStage(kind: ActionJobKind, job: Pick<IngestJobStatus, 'details'>): string {
  const d = job.details
  if (kind === 'explain') {
    switch (d?.stage) {
      case 'reading': return 'Reading the transcript…'
      case 'summarising': return d.part && d.parts ? `Summarising part ${d.part} of ${d.parts}…` : 'Summarising…'
      case 'writing': return 'Writing the explanation…'
    }
  } else {
    switch (d?.stage) {
      case 'reading': return 'Reading the transcript…'
      case 'checking': return 'Checking it is a recipe…'
      case 'extracting': return 'Extracting the recipe…'
    }
  }
  return 'Working…'
}

const storageKey = (kind: ActionJobKind, itemId: string) => `memex-job:${kind}:${itemId}`
const remember = (kind: ActionJobKind, itemId: string, jobId: string) => { try { sessionStorage.setItem(storageKey(kind, itemId), jobId) } catch { /* private mode */ } }
const forget = (kind: ActionJobKind, itemId: string) => { try { sessionStorage.removeItem(storageKey(kind, itemId)) } catch { /* private mode */ } }
const recall = (kind: ActionJobKind, itemId: string): string | null => { try { return sessionStorage.getItem(storageKey(kind, itemId)) } catch { return null } }

export interface ActionJobConfig {
  itemId: string
  kind: ActionJobKind
  /** Starts the job on the server. Rejects with the server's message if it cannot start (e.g. one is already running). */
  launch: (opts: ExplainRequest) => Promise<{ jobId: string }>
  /**
   * Called once when the job has completed successfully, to show its result. If it throws, the user is told the job
   * finished but the result could not be shown.
   */
  onCompleted: (job: IngestJobStatus) => void | Promise<void>
}

/**
 * Runs an on-demand AI action as a background job and follows it: start → poll progress → show the result.
 * The work continues on the server whatever this page does; if the user leaves and comes back, the job is picked up
 * again (its id is kept per action and item for the browser session), and a result that finished meanwhile is shown.
 * A job that "failed" is reported with the server's own message; a job that completed is handed to `onCompleted`
 * (which decides what a "nothing found" outcome looks like).
 */
export function useActionJob(config: ActionJobConfig) {
  const { itemId, kind } = config
  const [run, setRun] = useState<JobRun>(IDLE)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const failures = useRef(0)
  const latest = useRef(config)
  latest.current = config

  const stop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
  }, [])

  const finish = useCallback((failureMessage?: string) => {
    stop()
    forget(kind, itemId)
    setRun(IDLE)
    if (failureMessage) toast.error(failureMessage)
  }, [kind, itemId, stop])

  /** One look at the job. Returns true while it should keep being polled. */
  const check = useCallback(async (jobId: string): Promise<boolean> => {
    let job: IngestJobStatus
    try {
      job = await fetchIngestJob(jobId)
      failures.current = 0
    } catch (err) {
      // A job that no longer exists (server restarted, row cleaned up) is over; a flaky network is retried a few times.
      const gone = err instanceof Error && /not found/i.test(err.message)
      if (gone || ++failures.current >= MAX_POLL_FAILURES) {
        finish(gone ? undefined : LOST_CONTACT)
        return false
      }
      return true
    }

    if (job.status === 'completed') {
      stop()
      try {
        await latest.current.onCompleted(job)
        forget(kind, itemId)
        setRun(IDLE)
      } catch {
        finish(MESSAGES[kind].couldNotShow)
      }
      return false
    }
    if (job.status === 'failed') {
      finish(job.error || MESSAGES[kind].failed)
      return false
    }
    setRun({ running: true, percent: Math.max(3, job.progress), label: describeJobStage(kind, job) })
    return true
  }, [kind, itemId, finish, stop])

  const follow = useCallback((jobId: string) => {
    stop()
    failures.current = 0
    setRun({ running: true, percent: 3, label: 'Starting…' })
    void check(jobId)
    timer.current = setInterval(() => {
      void check(jobId).then(keepGoing => { if (!keepGoing) stop() })
    }, POLL_MS)
  }, [check, stop])

  /** Starts a job. Rejects (with the server's message) if it cannot be started. */
  const start = useCallback(async (opts: ExplainRequest) => {
    const { jobId } = await latest.current.launch(opts)
    remember(kind, itemId, jobId)
    follow(jobId)
  }, [kind, itemId, follow])

  // Pick a job back up after navigating away and returning.
  useEffect(() => {
    setRun(IDLE)
    const jobId = recall(kind, itemId)
    if (jobId) follow(jobId)
    return stop
  }, [kind, itemId, follow, stop])

  return { run, start }
}
