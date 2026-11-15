import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { explainItem, fetchIngestJob, fetchItem } from '../../lib/api'
import type { IngestJobStatus } from '../../lib/api'
import type { ExplainRequest, Item } from '../../../../shared/types'

const POLL_MS = 1500
/** Give up on a job whose status cannot be read this many times in a row (server down). */
const MAX_POLL_FAILURES = 5

export interface ExplainRun {
  running: boolean
  /** 0–100. */
  percent: number
  /** What it is doing right now, e.g. "Summarising part 3 of 6…". */
  label: string
}

const IDLE: ExplainRun = { running: false, percent: 0, label: '' }

/** Human wording for the job's stage. */
export function describeExplainStage(job: Pick<IngestJobStatus, 'details'>): string {
  const d = job.details
  switch (d?.stage) {
    case 'reading': return 'Reading the transcript…'
    case 'summarising': return d.part && d.parts ? `Summarising part ${d.part} of ${d.parts}…` : 'Summarising…'
    case 'writing': return 'Writing the explanation…'
    default: return 'Working…'
  }
}

const storageKey = (itemId: string) => `memex-explain-job:${itemId}`
const remember = (itemId: string, jobId: string) => { try { sessionStorage.setItem(storageKey(itemId), jobId) } catch { /* private mode */ } }
const forget = (itemId: string) => { try { sessionStorage.removeItem(storageKey(itemId)) } catch { /* private mode */ } }
const recall = (itemId: string): string | null => { try { return sessionStorage.getItem(storageKey(itemId)) } catch { return null } }

/**
 * Runs "Explain" as a background job and follows it: start → poll progress → re-read the item when it is done.
 * The work continues on the server whatever this page does; if the user leaves and comes back, the job is picked
 * up again (the id is kept per item for the browser session), and a result that finished meanwhile is shown.
 */
export function useExplainJob(itemId: string, onDone: (item: Item) => void) {
  const [run, setRun] = useState<ExplainRun>(IDLE)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const failures = useRef(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const stop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
  }, [])

  const finish = useCallback((failureMessage?: string) => {
    stop()
    forget(itemId)
    setRun(IDLE)
    if (failureMessage) toast.error(failureMessage)
  }, [itemId, stop])

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
        finish(gone ? undefined : 'Lost contact with the server while explaining. Check the item in a moment — it may still finish.')
        return false
      }
      return true
    }

    if (job.status === 'completed') {
      stop()
      try {
        const fresh = await fetchItem(itemId)
        onDoneRef.current(fresh)
        toast.success('Explanation saved')
        forget(itemId)
        setRun(IDLE)
      } catch {
        finish('The explanation finished, but the item could not be reloaded. Refresh the page.')
      }
      return false
    }
    if (job.status === 'failed') {
      finish(job.error || 'Failed to explain')
      return false
    }
    setRun({ running: true, percent: Math.max(3, job.progress), label: describeExplainStage(job) })
    return true
  }, [itemId, finish, stop])

  const follow = useCallback((jobId: string) => {
    stop()
    failures.current = 0
    setRun({ running: true, percent: 3, label: 'Starting…' })
    void check(jobId)
    timer.current = setInterval(() => {
      void check(jobId).then(keepGoing => { if (!keepGoing) stop() })
    }, POLL_MS)
  }, [check, stop])

  /** Starts a job. Rejects (with the server's message) if it cannot be started, e.g. one is already running. */
  const start = useCallback(async (opts: ExplainRequest) => {
    const { jobId } = await explainItem(itemId, opts)
    remember(itemId, jobId)
    follow(jobId)
  }, [itemId, follow])

  // Pick a job back up after navigating away and returning.
  useEffect(() => {
    setRun(IDLE)
    const jobId = recall(itemId)
    if (jobId) follow(jobId)
    return stop
  }, [itemId, follow, stop])

  return { run, start }
}
