import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Search, Check, AlertCircle, Bookmark } from 'lucide-react'
import { previewBookmarkImport, startBookmarkImport, fetchIngestJob } from '../../lib/api'
import type { IngestJobStatus, BookmarkEntryResult, BookmarkImportResponse, BookmarkSkipReason } from '../../lib/api'

const SKIP_LABEL: Record<BookmarkSkipReason, string> = {
  'already-saved': 'Already in Memex',
  'duplicate-in-file': 'Repeated in this file',
  'not-a-link': 'Not a web address',
  'limit-reached': 'Over the 1,000-link limit',
}

const POLL_MS = 2000

function EntryRow({ e }: { e: BookmarkEntryResult }) {
  const skipped = e.status === 'skipped'
  return (
    <li
      data-testid={skipped ? 'entry-skipped' : 'entry-new'}
      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${skipped ? 'text-ink-muted/60' : 'text-ink'}`}
    >
      <span className="flex-1 min-w-0 truncate" title={e.url}>{e.title || e.url}</span>
      {e.tags.length > 0 && !skipped && (
        <span className="shrink-0 max-w-[40%] truncate text-[10px] text-ink-muted bg-white/5 px-1.5 py-0.5 rounded">{e.tags.slice(0, 3).join(', ')}</span>
      )}
      {skipped && (
        <span className="shrink-0 text-[10px] text-amber-400/80">
          {e.reason ? SKIP_LABEL[e.reason] : 'Skipped'}
          {e.reason === 'already-saved' && e.existingId && (
            <>{' · '}<Link to={`/item/${e.existingId}`} className="underline hover:text-amber-300">view</Link></>
          )}
        </span>
      )}
    </li>
  )
}

/**
 * Import saved links from a browser bookmarks export, Pocket or Raindrop. Preview shows what will be saved and what will
 * be skipped (nothing is written, no page is opened); Import saves instantly and classifies in the background.
 */
export default function BookmarkImportPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [plan, setPlan] = useState<BookmarkImportResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BookmarkImportResponse | null>(null)
  const [job, setJob] = useState<IngestJobStatus | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
  }
  useEffect(() => stopPolling, [])

  const onPick = (f: File | null) => {
    setFile(f); setPlan(null); setError(null)
  }

  const handlePreview = async () => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      setPlan(await previewBookmarkImport(file))
    } catch (err) {
      setPlan(null)
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const res = await startBookmarkImport(file)
      setResult(res)
      if ((res.saved ?? 0) > 0) window.dispatchEvent(new Event('memex:item-captured'))
      if (!res.jobId) return
      const jobId = res.jobId
      setJob({ status: 'processing', progress: 0, total: res.saved ?? 0, completed: 0 })
      timer.current = setInterval(async () => {
        try {
          const j = await fetchIngestJob(jobId)
          setJob(j)
          if (j.status === 'completed' || j.status === 'failed') stopPolling()
        } catch {
          stopPolling()
        }
      }, POLL_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    stopPolling()
    setFile(null); setPlan(null); setResult(null); setJob(null); setError(null)
  }

  if (result) {
    const running = job !== null && job.status === 'processing'
    const failed = job?.details?.failed ?? []
    return (
      <div data-testid="bookmark-result" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center shrink-0">
            <Check size={20} />
          </div>
          <div>
            <p className="text-ink font-medium">
              {result.saved ?? 0} saved{result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
            </p>
            <p className="text-xs text-ink-muted">
              {result.jobId ? 'They are in Memex now; AI is classifying them in the background from the title and address.' : 'Nothing new to save.'}
            </p>
          </div>
        </div>

        {job && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-ink-muted">
              <span>{job.status === 'failed' ? 'Classification failed' : running ? 'AI classification' : 'Classification finished'}</span>
              <span>{job.completed}/{job.total}</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${job.status === 'failed' ? 'bg-red-400' : 'bg-accent'}`}
                style={{ width: `${job.progress}%` }}
              />
            </div>
            {running && <p className="text-[10px] text-ink-muted">You can close this — classification continues in the background.</p>}
          </div>
        )}

        {job?.status === 'failed' && job.error && (
          <p role="alert" className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">{job.error}</p>
        )}
        {job?.status === 'completed' && failed.length > 0 && (
          <div role="alert" className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3 space-y-1">
            <p>{failed.length} link{failed.length === 1 ? '' : 's'} could not be classified (they are saved and can be re-classified from the item page):</p>
            <ul className="list-disc pl-4 text-amber-300/80">
              {failed.map(f => <li key={f.itemId}>{f.title}: {f.error}</li>)}
            </ul>
          </div>
        )}

        <ul className="max-h-44 overflow-y-auto border border-white/5 rounded-lg p-1">
          {result.entries.map(e => <EntryRow key={e.index} e={e} />)}
        </ul>

        <button onClick={reset} className="self-start text-xs bg-white/5 hover:bg-white/10 text-ink border border-white/10 px-4 py-2 rounded-lg font-bold">
          Import more
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="bookmark-file" className="block text-sm text-ink mb-1.5">A bookmarks export file (.html, or Raindrop .csv)</label>
        <input
          id="bookmark-file"
          type="file"
          accept=".html,.htm,.csv"
          disabled={busy}
          onChange={e => onPick(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-2 file:text-ink hover:file:bg-white/10"
        />
        <p className="text-[11px] text-ink-muted mt-1.5 flex items-start gap-1.5">
          <Bookmark size={12} className="mt-0.5 shrink-0" />
          <span>Export from Chrome, Edge, Firefox or Safari (Bookmarks manager &gt; Export), Pocket or Raindrop, then choose the file here. Up to 1,000 links at a time. Folders and tags become tags. No page is opened: links are saved with their title and address only, and nothing is sent anywhere until the AI classifies them, under your usual provider and privacy settings. Open a link and choose Re-classify to have the page read.</span>
        </p>
      </div>

      {plan && (
        <div data-testid="bookmark-plan" className="space-y-2">
          <p className="text-sm text-ink">
            <span className="font-medium">{plan.new}</span> to import
            {plan.skipped > 0 && <span className="text-ink-muted"> · {plan.skipped} skipped</span>}
                      </p>
          <ul className="max-h-44 overflow-y-auto border border-white/5 rounded-lg p-1">
            {plan.entries.map(e => <EntryRow key={e.index} e={e} />)}
          </ul>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={busy || !file}
          className="flex items-center justify-center gap-2 text-sm bg-white/5 hover:bg-white/10 text-ink border border-white/10 px-5 py-3 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy && !plan ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Preview
        </button>
        <button
          onClick={handleImport}
          disabled={busy || !plan || plan.new === 0}
          className="flex-1 flex items-center justify-center gap-2 text-sm bg-accent hover:bg-accent-dark text-bg font-bold px-5 py-3 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy && plan ? <Loader2 size={16} className="animate-spin" /> : null}
          {plan ? `Import ${plan.new} link${plan.new === 1 ? '' : 's'}` : 'Import'}
        </button>
      </div>
    </div>
  )
}
