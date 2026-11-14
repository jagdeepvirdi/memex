import { useEffect, useRef, useState } from 'react'
import { Loader2, Play, Search } from 'lucide-react'
import { apiFetch } from '../../lib/api'

interface DryRun {
  counts: { candidates: number; skipped: number; duplicates: number }
  estimateSeconds: number
}

interface JobStatus {
  status: string
  progress: number
  elapsed?: number | string
  error?: string
}

function formatEta(seconds: number): string {
  if (seconds < 90) return `${seconds}s`
  return `~${Math.round(seconds / 60)} min`
}

/** Preview + run the YouTube backfill (POST /ingest/youtube/backfill), polling the shared job endpoint. */
export default function YouTubeBackfillPanel() {
  const [plan, setPlan] = useState<DryRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const preview = async () => {
    setBusy(true); setError(null); setJob(null)
    try {
      setPlan(await apiFetch<DryRun>('/ingest/youtube/backfill', {
        method: 'POST',
        body: JSON.stringify({ dryRun: true }),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    setBusy(true); setError(null)
    try {
      const res = await apiFetch<{ jobId: string | null; total: number }>('/ingest/youtube/backfill', {
        method: 'POST',
        body: JSON.stringify({ dryRun: false }),
      })
      if (!res.jobId) { setPlan(null); return }
      setJob({ status: 'running', progress: 0 })
      timer.current = setInterval(async () => {
        try {
          const j = await apiFetch<JobStatus>(`/ingest/jobs/${res.jobId}`)
          setJob(j)
          if (j.status === 'completed' || j.status === 'failed') {
            if (timer.current) clearInterval(timer.current)
            setBusy(false)
          }
        } catch {
          if (timer.current) clearInterval(timer.current)
          setBusy(false)
        }
      }, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backfill failed to start')
      setBusy(false)
    }
  }

  const running = job !== null && job.status !== 'completed' && job.status !== 'failed'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink font-medium">Backfill YouTube links</p>
          <p className="text-xs text-ink-muted mt-0.5">
            Re-reads saved YouTube links for title, channel and transcript, then re-classifies them.
            Reviewed items are never touched. Preview first — nothing is written.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={preview}
            disabled={busy}
            className="flex items-center gap-2 text-xs bg-white/5 text-ink border border-white/10 px-4 py-2 rounded-lg font-bold hover:bg-white/10 disabled:opacity-50"
          >
            {busy && !running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Preview
          </button>
          <button
            onClick={run}
            disabled={busy || !plan || plan.counts.candidates === 0}
            className="flex items-center gap-2 text-xs bg-accent/20 text-accent border border-accent/30 px-4 py-2 rounded-lg font-bold hover:bg-accent/30 disabled:opacity-40"
          >
            <Play size={14} />
            Run
          </button>
        </div>
      </div>

      {plan && !job && (
        <p className="text-xs text-ink-muted">
          {plan.counts.candidates} to process · {plan.counts.skipped} skipped · {plan.counts.duplicates} duplicates
          {plan.counts.candidates > 0 && <> · est. {formatEta(plan.estimateSeconds)}</>}
        </p>
      )}

      {job && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>{job.status === 'completed' ? 'Done' : job.status === 'failed' ? 'Failed' : 'Backfilling…'}</span>
            <span>{job.progress}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${job.progress}%` }} />
          </div>
          {job.error && <p className="text-xs text-red-400">{job.error}</p>}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
