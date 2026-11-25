import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Link2, Loader2, NotebookText, RotateCcw, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useOutboxStore } from '../../store/outboxStore'
import type { OutboxItem } from '../../lib/outbox'
import { autoRetryDelay } from '../../lib/outboxSync'

/** A short, readable label for a queued item: the address for a link, the first words for a note. */
export function outboxLabel(item: OutboxItem): string {
  if (item.kind === 'url') {
    try {
      const u = new URL(item.value)
      return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 80)
    } catch {
      return item.value.slice(0, 80)
    }
  }
  const plain = item.value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return plain.length > 80 ? `${plain.slice(0, 80)}…` : plain
}

/**
 * "N waiting" in the header, shown only when something is kept on this device. Opens the list: what is waiting, send it
 * now, take something out, retry what failed. It also sends by itself: when the app opens, when the network comes back,
 * when something new is kept, and on a timer that slows down while Memex stays unreachable (the laptop may be off).
 */
export default function OutboxIndicator() {
  const { items, flushing, lastResult, refresh, flush, remove, retry } = useOutboxStore()
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { void refresh() }, [refresh])

  const waitingCount = items.filter((i) => i.status === 'waiting').length
  const hasWaiting = waitingCount > 0
  const missesRef = useRef(0)
  const pausedRef = useRef(false) // signed out: wait for the app to be opened again instead of retrying blindly
  const lastCountRef = useRef(0)

  /** One automatic try. Quiet unless something was actually saved or an item gave up. */
  const autoSend = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!useOutboxStore.getState().items.some((i) => i.status === 'waiting')) return
    const summary = await useOutboxStore.getState().flush()
    if (!summary) return
    if (summary.stoppedBecause === 'auth') pausedRef.current = true
    missesRef.current = summary.stoppedBecause === 'unreachable' || summary.stoppedBecause === 'busy' ? missesRef.current + 1 : 0
    if (summary.sent + summary.duplicates > 0) {
      window.dispatchEvent(new Event('memex:item-captured'))
      window.dispatchEvent(new Event('memex:categories-changed'))
      toast.success(useOutboxStore.getState().lastResult ?? 'Saved')
    } else if (summary.failed > 0) {
      toast.warning(useOutboxStore.getState().lastResult ?? 'Some items could not be saved')
    }
  }, [])

  // Send by itself whenever something is waiting: now, then again after a growing pause while Memex stays unreachable.
  useEffect(() => {
    if (!hasWaiting) { missesRef.current = 0; return }
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const tick = async () => {
      if (!pausedRef.current) await autoSend()
      if (!cancelled) timer = setTimeout(() => { void tick() }, autoRetryDelay(missesRef.current))
    }
    void tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [hasWaiting, autoSend])

  // Things that suggest the laptop may be reachable now: the network came back, or the app was brought to the front.
  useEffect(() => {
    if (!hasWaiting) return
    const retryNow = () => { pausedRef.current = false; missesRef.current = 0; void autoSend() }
    const onVisible = () => { if (document.visibilityState === 'visible') retryNow() }
    window.addEventListener('online', retryNow)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('online', retryNow); document.removeEventListener('visibilitychange', onVisible) }
  }, [hasWaiting, autoSend])

  // A newly kept item is tried straight away, even while the timer is in a long pause.
  useEffect(() => {
    if (waitingCount > lastCountRef.current && lastCountRef.current > 0) { missesRef.current = 0; void autoSend() }
    lastCountRef.current = waitingCount
  }, [waitingCount, autoSend])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Close the panel on its own once the last item is gone.
  useEffect(() => { if (open && items.length === 0) setOpen(false) }, [open, items.length])

  if (items.length === 0) return null

  const waiting = items.filter((i) => i.status === 'waiting').length
  const failed = items.length - waiting

  const handleSend = async () => {
    const summary = await flush()
    if (summary && summary.sent + summary.duplicates > 0) {
      window.dispatchEvent(new Event('memex:item-captured'))
      window.dispatchEvent(new Event('memex:categories-changed'))
    }
    if (summary) toast[summary.stoppedBecause || summary.failed > 0 ? 'warning' : 'success'](useOutboxStore.getState().lastResult ?? 'Done')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${items.length} item${items.length === 1 ? '' : 's'} saved on this device${failed > 0 ? `, ${failed} could not be sent` : ', waiting to send'}`}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          failed > 0 ? 'border-orange-400/30 bg-orange-400/10 text-orange-400' : 'border-accent/30 bg-accent/10 text-accent'
        }`}
      >
        <Clock size={13} aria-hidden="true" />
        <span>{items.length} waiting</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="outbox-title"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-white/10 bg-surface shadow-2xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/5 p-5">
              <div>
                <h2 id="outbox-title" className="font-display text-lg text-ink">Saved for later</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Kept on this device. They go to Memex when it can be reached, and show up in Pending to review.
                </p>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <ul className="flex-1 divide-y divide-white/5 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                  {item.kind === 'url'
                    ? <Link2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-muted" />
                    : <NotebookText size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{outboxLabel(item)}</p>
                    <p className={`mt-0.5 text-[11px] ${item.status === 'failed' ? 'text-orange-400' : 'text-ink-muted'}`}>
                      {item.status === 'failed' ? `Could not be saved: ${item.lastError ?? 'unknown reason'}` : item.attempts > 0 ? `Waiting (tried ${item.attempts}×: ${item.lastError ?? 'try again'})` : 'Waiting to send'}
                    </p>
                  </div>
                  {item.status === 'failed' && (
                    <button type="button" onClick={() => void retry(item.id)} aria-label={`Try again: ${outboxLabel(item)}`} className="text-ink-muted hover:text-ink">
                      <RotateCcw size={15} />
                    </button>
                  )}
                  <button type="button" onClick={() => void remove(item.id)} aria-label={`Remove from saved for later: ${outboxLabel(item)}`} className="text-ink-muted hover:text-red-400">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="space-y-2 border-t border-white/5 p-4">
              {lastResult && <p role="status" className="text-xs text-ink-muted">{lastResult}</p>}
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={flushing || waiting === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-bold text-bg transition-all hover:bg-accent-dark disabled:opacity-50"
              >
                {flushing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {flushing ? 'Sending…' : waiting === 0 ? 'Nothing to send' : `Send ${waiting} now`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
