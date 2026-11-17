import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Info, Loader2, ShieldCheck } from 'lucide-react'
import {
  fetchEmbeddingStatus, fetchReembedEstimate, setEmbeddingModel, startReembed,
} from '../../lib/api'
import type { EmbeddingProviderId, EmbeddingStatus, ReembedEstimate } from '../../lib/api'
import { useReembedJob } from './useReembedJob'

const PROVIDERS: Array<{ id: EmbeddingProviderId; label: string; defaultModel: string }> = [
  { id: 'ollama', label: 'Ollama (local)', defaultModel: 'nomic-embed-text' },
  { id: 'gemini', label: 'Gemini (cloud)', defaultModel: 'gemini-embedding-001' },
  { id: 'openai', label: 'OpenAI (cloud)', defaultModel: 'text-embedding-3-small' },
]
const LABEL = Object.fromEntries(PROVIDERS.map(p => [p.id, p.label])) as Record<EmbeddingProviderId, string>
const NAME = { ollama: 'Ollama', gemini: 'Gemini', openai: 'OpenAI' } as const

const inputCls =
  'bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink outline-none focus:border-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnCls =
  'flex items-center gap-2 text-xs px-4 py-2 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed'

const n = (v: number) => v.toLocaleString()

/** The error text of a failed request (the server's own message when it sent one). */
const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

/**
 * Which embedding model powers semantic search, Ask and related items, and how to change it.
 * Changing it is deliberate and in steps: Review shows what would happen (nothing is sent), Confirm switches and starts
 * a background re-embed, which is the only step that sends library text to a provider. Private items never leave.
 */
export function EmbeddingSettings() {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [provider, setProvider] = useState<EmbeddingProviderId>('ollama')
  const [model, setModel] = useState('')
  const [estimate, setEstimate] = useState<ReembedEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const s = await fetchEmbeddingStatus()
      setStatus(s)
      setLoadFailed(false)
      return s
    } catch {
      setLoadFailed(true)
      return null
    }
  }, [])

  const { run, follow, cancel } = useReembedJob(() => { void reload() })

  // First load: show the active model in the pickers, and pick up a job that is already running (after a page reload).
  const initialised = useRef(false)
  useEffect(() => {
    void reload().then(s => {
      if (!s || initialised.current) return
      initialised.current = true
      setProvider(s.provider)
      setModel(s.provider === 'ollama' ? '' : s.model)
      if (s.job) follow(s.job.id)
    })
  }, [reload, follow])

  const busy = run.running || working
  const isActive = (e: ReembedEstimate) => status !== null && e.target.id === status.id

  const handleReview = async () => {
    setError(null)
    setEstimate(null)
    setEstimating(true)
    try {
      setEstimate(await fetchReembedEstimate(provider, model))
    } catch (err) {
      setError(messageOf(err, 'Could not work out what this change would do'))
    } finally {
      setEstimating(false)
    }
  }

  /** Re-embed with the model that is already active (e.g. items waiting, or from an older model). */
  const handleReviewActive = async () => {
    setError(null)
    setEstimate(null)
    setEstimating(true)
    try {
      const e = await fetchReembedEstimate()
      setProvider(e.target.provider)
      setModel(e.target.provider === 'ollama' ? '' : e.target.model)
      setEstimate(e)
    } catch (err) {
      setError(messageOf(err, 'Could not work out what re-embedding would do'))
    } finally {
      setEstimating(false)
    }
  }

  const handleConfirm = async () => {
    if (!estimate) return
    setError(null)
    setWorking(true)
    try {
      let id = estimate.target.id
      if (!isActive(estimate)) {
        const switched = await setEmbeddingModel(estimate.target.provider, model)
        setStatus(switched)
        id = switched.id
      }
      if (estimate.items + estimate.entities > 0) {
        const { jobId } = await startReembed(id)
        follow(jobId)
      } else {
        toast.success('Embedding model switched. Nothing needed re-embedding.')
        void reload()
      }
      setEstimate(null)
    } catch (err) {
      setError(messageOf(err, 'Could not change the embedding model'))
      void reload()
    } finally {
      setWorking(false)
    }
  }

  if (loadFailed && !status) {
    return <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={13} /> Could not read the embedding status.</p>
  }
  if (!status) {
    return <p className="text-xs text-ink-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading…</p>
  }

  const { counts } = status
  const waiting = counts.needsReembed + counts.pending
  const changed = provider !== status.provider || (provider !== 'ollama' && model.trim() !== '' && model.trim() !== status.model)

  return (
    <div className="flex flex-col gap-5" data-testid="embedding-settings">
      {/* Where things stand */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="font-medium">Active embedding model</span>
          <span className="text-xs text-ink-muted font-mono bg-white/5 px-2 py-1 rounded">{status.id}</span>
        </div>
        <p className="text-xs text-ink-muted">
          {n(counts.embedded)} of {n(counts.total)} items searchable by meaning
          {counts.needsReembed > 0 && <> · {n(counts.needsReembed)} made by another model</>}
          {counts.pending > 0 && <> · {n(counts.pending)} waiting</>}
          {counts.skippedPrivate > 0 && <> · {n(counts.skippedPrivate)} private, kept on this machine</>}
        </p>
      </div>

      {status.blockedReason && (
        <div role="alert" className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>Semantic search is paused: {status.blockedReason}.</span>
        </div>
      )}

      {!run.running && status.usable && waiting > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          <Info size={14} className="shrink-0" />
          <span>
            {counts.needsReembed > 0
              ? `${n(counts.needsReembed)} items were embedded by a different model, so search ignores them until they are re-embedded.`
              : `${n(counts.pending)} items have no embedding yet.`}
          </span>
          <button onClick={handleReviewActive} disabled={busy || estimating} className={`${btnCls} bg-white/5 hover:bg-white/10 text-ink`}>
            Review re-embed
          </button>
        </div>
      )}

      {/* A running job */}
      {run.running && (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-xs text-ink">
            <span className="flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {run.label}</span>
            <button onClick={cancel} disabled={run.cancelling} className={`${btnCls} bg-white/5 hover:bg-white/10 text-ink`}>
              {run.cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.percent}>
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${run.percent}%` }} />
          </div>
          <p className="text-[11px] text-ink-muted">It keeps working if you leave this page. Cancelling keeps what is done; running it again continues from there.</p>
        </div>
      )}

      {/* Choose a model */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Provider
            <select
              aria-label="Embedding provider"
              value={provider}
              disabled={busy}
              onChange={e => { setProvider(e.target.value as EmbeddingProviderId); setModel(''); setEstimate(null); setError(null) }}
              className={`${inputCls} cursor-pointer`}
            >
              {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {provider !== 'ollama' && (
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              Model
              <input
                aria-label="Embedding model id"
                value={model}
                disabled={busy}
                placeholder={PROVIDERS.find(p => p.id === provider)!.defaultModel}
                onChange={e => { setModel(e.target.value); setEstimate(null) }}
                className={`${inputCls} w-56 font-mono`}
              />
            </label>
          )}
          <button
            onClick={handleReview}
            disabled={busy || estimating || !changed}
            className={`${btnCls} bg-white/5 hover:bg-white/10 text-ink`}
          >
            {estimating && <Loader2 size={12} className="animate-spin" />}
            Review change
          </button>
        </div>
        <p className="text-[11px] text-ink-muted max-w-xl">
          Reviewing sends nothing. Search, Ask and related items can only compare vectors made by the same model, so changing it means
          re-embedding your library. Old vectors are kept, so switching back is instant.
        </p>
      </div>

      {error && <p role="alert" className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}

      {/* The confirmation step */}
      {estimate && (
        <div className="flex flex-col gap-3 bg-bg/60 border border-white/10 rounded-xl p-4" data-testid="embedding-estimate">
          <p className="text-sm text-ink font-medium">
            {isActive(estimate) ? 'Re-embed with' : 'Switch to'} {LABEL[estimate.target.provider]} <span className="font-mono text-xs text-ink-muted">{estimate.target.id}</span>
          </p>

          {estimate.cloud ? (
            <p className="text-xs text-ink">
              The text of <strong>{n(estimate.items)} items</strong> (about {n(estimate.approxTokens)} tokens, {n(estimate.characters)} characters)
              will be sent to {NAME[estimate.target.provider]} to be embedded.
            </p>
          ) : (
            <p className="text-xs text-ink">
              {n(estimate.items)} items{estimate.entities > 0 && <> and {n(estimate.entities)} names</>} will be embedded on this machine with Ollama
              (it must be running).
            </p>
          )}

          {estimate.cloud && (
            <p className="text-xs text-ink-muted flex items-start gap-1.5">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-400" />
              <span>
                {estimate.skippedPrivate > 0 ? `${n(estimate.skippedPrivate)} private items` : 'Private items'} (vault, passwords, Personal, or tagged
                private / no-cloud / local-only) are never sent.
              </span>
            </p>
          )}

          {estimate.alreadyDone > 0 && <p className="text-xs text-ink-muted">{n(estimate.alreadyDone)} items already have a vector from this model.</p>}
          {estimate.items + estimate.entities === 0 && <p className="text-xs text-ink-muted">Nothing needs embedding.</p>}

          {!isActive(estimate) && estimate.items > 0 && (
            <p className="text-xs text-ink-muted">Until it finishes, search falls back to keywords for items that do not have a vector from the new model yet.</p>
          )}

          {estimate.blockedReason && (
            <p role="alert" className="text-xs text-amber-300 flex items-start gap-1.5">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {estimate.blockedReason}.
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirm}
              disabled={busy || !!estimate.blockedReason || (isActive(estimate) && estimate.items + estimate.entities === 0)}
              className={`${btnCls} bg-accent text-bg hover:opacity-90`}
            >
              {working && <Loader2 size={12} className="animate-spin" />}
              {isActive(estimate)
                ? (estimate.items + estimate.entities > 0 ? 'Re-embed now' : 'Nothing to do')
                : (estimate.items + estimate.entities > 0 ? 'Switch and re-embed' : 'Switch')}
            </button>
            <button onClick={() => setEstimate(null)} disabled={working} className={`${btnCls} bg-white/5 hover:bg-white/10 text-ink`}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
