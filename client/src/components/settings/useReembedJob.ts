import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, cancelIngestJob, fetchIngestJob } from '../../lib/api'
import type { IngestJobStatus } from '../../lib/api'

const POLL_MS = 1500
/** Give up on a job whose status cannot be read this many times in a row (server down). */
const MAX_POLL_FAILURES = 5

export interface ReembedRun {
  running: boolean
  /** 0-100. */
  percent: number
  /** What it is doing right now, e.g. "Embedding items: 120 of 657". */
  label: string
  /** The user pressed Cancel and the server has been asked to stop; waiting for it to confirm. */
  cancelling: boolean
}

const IDLE: ReembedRun = { running: false, percent: 0, label: '', cancelling: false }
const CANCELLING_LABEL = 'Cancelling…'
const LOST_CONTACT = 'Lost contact with the server while re-embedding. It may still be running: reload this page in a moment.'

/** Where a job has got to, in words. */
export function describeReembedProgress(job: Pick<IngestJobStatus, 'completed' | 'total' | 'details'>): string {
  const what = job.details?.stage === 'entities' ? 'Embedding names' : 'Embedding items'
  return job.total > 0 ? `${what}: ${job.completed} of ${job.total}` : 'Starting…'
}

/** The sentence shown when a job ends, so "done" says what actually happened. */
export function describeReembedOutcome(job: Pick<IngestJobStatus, 'details'>): string {
  const d = job.details
  const parts = [`${d?.embedded ?? 0} embedded`]
  if (d?.skippedPrivate) parts.push(`${d.skippedPrivate} private kept on this machine`)
  if (d?.failures) parts.push(`${d.failures} could not be embedded (run it again to retry)`)
  return parts.join(', ')
}

/**
 * Follows a re-embed job started on the server: poll its progress, offer Cancel, and report how it ended. The work
 * continues on the server whatever this page does; `follow` can be called again after a reload (the status endpoint
 * names the running job). `onFinished` runs once the job is over, however it ended, so the caller can reload counts.
 */
export function useReembedJob(onFinished: () => void) {
  const [run, setRun] = useState<ReembedRun>(IDLE)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const failures = useRef(0)
  const currentJob = useRef<string | null>(null)
  const cancelling = useRef(false)
  const finishedRef = useRef(onFinished)
  finishedRef.current = onFinished

  const stop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
  }, [])

  const end = useCallback((toaster?: () => void) => {
    stop()
    currentJob.current = null
    cancelling.current = false
    setRun(IDLE)
    toaster?.()
    finishedRef.current()
  }, [stop])

  /** One look at the job. Returns true while it should keep being polled. */
  const check = useCallback(async (jobId: string): Promise<boolean> => {
    let job: IngestJobStatus
    try {
      job = await fetchIngestJob(jobId)
      failures.current = 0
    } catch (err) {
      // A job that no longer exists is over; a flaky network is retried a few times.
      const gone = err instanceof Error && /not found/i.test(err.message)
      if (gone || ++failures.current >= MAX_POLL_FAILURES) {
        end(gone ? undefined : () => toast.error(LOST_CONTACT))
        return false
      }
      return true
    }

    if (job.status === 'completed') { end(() => toast.success(`Re-embedding finished: ${describeReembedOutcome(job)}`)); return false }
    if (job.status === 'failed') { end(() => toast.error(job.error || 'Re-embedding failed')); return false }
    if (job.status === 'cancelled') { end(() => toast.message(`Re-embedding cancelled. ${describeReembedOutcome(job)}; the rest can be resumed.`)); return false }

    setRun({
      running: true,
      percent: Math.max(3, job.progress),
      label: cancelling.current ? CANCELLING_LABEL : describeReembedProgress(job),
      cancelling: cancelling.current,
    })
    return true
  }, [end])

  const follow = useCallback((jobId: string) => {
    stop()
    failures.current = 0
    currentJob.current = jobId
    cancelling.current = false
    setRun({ running: true, percent: 3, label: 'Starting…', cancelling: false })
    void check(jobId)
    timer.current = setInterval(() => {
      void check(jobId).then(keepGoing => { if (!keepGoing) stop() })
    }, POLL_MS)
  }, [check, stop])

  /** Asks the server to stop. The normal polling reports the outcome (cancelled, or its real result if it finished first). */
  const cancel = useCallback(async () => {
    const jobId = currentJob.current
    if (!jobId || cancelling.current) return
    cancelling.current = true
    setRun(r => ({ ...r, cancelling: true, label: CANCELLING_LABEL }))
    try {
      await cancelIngestJob(jobId)
      void check(jobId)
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined
      if (status === 409) { void check(jobId); return } // already finished: show what actually happened
      if (status === 404) { end(); return }              // gone: nothing left to cancel
      cancelling.current = false
      setRun(r => ({ ...r, cancelling: false, label: 'Re-embedding…' }))
      toast.error(err instanceof Error ? err.message : 'Could not cancel')
    }
  }, [check, end])

  useEffect(() => stop, [stop])

  return { run, follow, cancel }
}
