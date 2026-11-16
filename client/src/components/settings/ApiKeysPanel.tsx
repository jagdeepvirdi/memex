import { useEffect, useState } from 'react'
import { Check, Loader2, AlertCircle, KeyRound, Trash2 } from 'lucide-react'
import { fetchApiKeys, saveApiKey, removeApiKey, testYoutubeKey } from '../../lib/api'
import type { ApiKeyProvider, ApiKeyStatus, YoutubeKeyTest } from '../../lib/api'

interface Props {
  /** Called after a key is saved or removed so provider availability can be re-read. */
  onChanged?: () => void
}

const HELP: Record<ApiKeyProvider, { use: string; where: string }> = {
  claude: {
    use: 'Lets Claude answer when you pick it (Settings above) and cloud AI is allowed.',
    where: 'Create one at console.anthropic.com → API keys.',
  },
  gemini: {
    use: 'Lets Gemini answer when you pick it (Settings above) and cloud AI is allowed.',
    where: 'Create one at aistudio.google.com → Get API key.',
  },
  openai: {
    use: 'Lets ChatGPT models answer when you pick OpenAI (Settings above) and cloud AI is allowed. This is the paid API, separate from a ChatGPT subscription.',
    where: 'Create one at platform.openai.com → API keys.',
  },
  youtube: {
    use: 'Fetches a video’s full description, where recipes and links usually are. Used by Explain and Extract recipe, and helps when captions are disabled.',
    where: 'Google Cloud console → enable “YouTube Data API v3” → Credentials → API key. The free daily quota is plenty.',
  },
}

const ORDER: ApiKeyProvider[] = ['claude', 'gemini', 'openai', 'youtube']

function describeSource(s: ApiKeyStatus): string {
  const tail = s.last4 ? ` · ends in ${s.last4}` : ''
  if (s.source === 'env') return `From the server environment${tail}` + (s.hasStored ? ' (a saved key is also stored, but the environment one takes priority)' : ' (takes priority over a saved key)')
  if (s.source === 'stored') return `Saved${tail}`
  return 'Not set'
}

/**
 * Enter, replace or remove API keys. Keys are write-only: they go to the server, are stored encrypted, and are
 * never sent back — this panel only ever sees whether a key is set and its last four characters.
 */
export function ApiKeysPanel({ onChanged }: Props) {
  const [statuses, setStatuses] = useState<ApiKeyStatus[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<ApiKeyProvider, string>>>({})
  const [busy, setBusy] = useState<ApiKeyProvider | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ApiKeyProvider, string>>>({})
  const [notice, setNotice] = useState<Partial<Record<ApiKeyProvider, string>>>({})
  const [ytTest, setYtTest] = useState<YoutubeKeyTest | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchApiKeys()
      .then(s => { if (!cancelled) setStatuses(s) })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Couldn’t load key status.') })
    return () => { cancelled = true }
  }, [])

  const status = (p: ApiKeyProvider) => statuses?.find(s => s.provider === p)
  const patchStatus = (next: ApiKeyStatus) =>
    setStatuses(prev => (prev ?? []).map(s => (s.provider === next.provider ? next : s)))
  const setMsg = (setter: typeof setErrors | typeof setNotice, p: ApiKeyProvider, v: string | null) =>
    setter(prev => { const n = { ...prev }; if (v) n[p] = v; else delete n[p]; return n })

  const save = async (p: ApiKeyProvider) => {
    const key = (drafts[p] ?? '').trim()
    if (!key) return
    setBusy(p); setMsg(setErrors, p, null); setMsg(setNotice, p, null)
    try {
      patchStatus(await saveApiKey(p, key))
      setDrafts(d => ({ ...d, [p]: '' })) // the key leaves the browser's state as soon as it is saved
      if (p === 'youtube') setYtTest(null)
      setMsg(setNotice, p, 'Key saved.')
      onChanged?.()
    } catch (err) {
      setMsg(setErrors, p, err instanceof Error ? err.message : 'Couldn’t save the key.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (p: ApiKeyProvider) => {
    setBusy(p); setMsg(setErrors, p, null); setMsg(setNotice, p, null)
    try {
      patchStatus(await removeApiKey(p))
      if (p === 'youtube') setYtTest(null)
      setMsg(setNotice, p, 'Saved key removed.')
      onChanged?.()
    } catch (err) {
      setMsg(setErrors, p, err instanceof Error ? err.message : 'Couldn’t remove the key.')
    } finally {
      setBusy(null)
    }
  }

  const runYoutubeTest = async () => {
    setTesting(true); setYtTest(null)
    try {
      setYtTest(await testYoutubeKey())
    } catch (err) {
      setYtTest({ ok: false, kind: 'unavailable', error: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="pt-4 border-t border-white/5 space-y-4" data-testid="api-keys-panel">
      <div>
        <p className="text-sm text-ink font-medium flex items-center gap-1.5"><KeyRound size={14} aria-hidden="true" /> API keys</p>
        <p className="text-xs text-ink-muted mt-0.5 max-w-xl">
          Paste a key to use a cloud provider or the YouTube API. Keys are stored encrypted on this machine and are never shown
          again or sent back to the browser. A key set in the server’s <code className="bg-white/10 px-1 rounded">.env</code> always takes priority.
        </p>
      </div>

      {loadError && <p role="alert" className="text-xs text-red-400">{loadError}</p>}

      {ORDER.map(p => {
        const s = status(p)
        const draft = drafts[p] ?? ''
        const working = busy === p
        return (
          <div key={p} className="space-y-1.5" data-testid={`api-key-${p}`}>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor={`api-key-input-${p}`} className="text-xs text-ink font-medium">{s?.label ?? p}</label>
              {s && (
                <span className={`text-[11px] flex items-center gap-1 ${s.configured ? 'text-green-400' : 'text-ink-muted'}`} data-testid={`api-key-status-${p}`}>
                  {s.configured && <Check size={11} aria-hidden="true" />}
                  {describeSource(s)}
                </span>
              )}
            </div>

            {s?.undecryptable && (
              <p role="alert" className="flex items-start gap-1.5 text-[11px] text-yellow-400">
                <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                A saved key can’t be read (the server’s encryption secret has changed). Enter it again to replace it.
              </p>
            )}

            <div className="flex items-center gap-2">
              <input
                id={`api-key-input-${p}`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                disabled={working || !statuses}
                placeholder={s?.hasStored ? 'Enter a new key to replace the saved one' : 'Paste your key'}
                onChange={e => setDrafts(d => ({ ...d, [p]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') void save(p) }}
                className="flex-1 min-w-0 bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink font-mono outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
              />
              <button
                onClick={() => void save(p)}
                disabled={working || !draft.trim()}
                className="flex items-center gap-1.5 text-xs bg-accent/15 hover:bg-accent/25 text-accent border border-accent/20 px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 shrink-0"
              >
                {working && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                Save
              </button>
              {s?.hasStored && (
                <button
                  onClick={() => void remove(p)}
                  disabled={working}
                  aria-label={`Remove saved ${s.label} key`}
                  className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-red-500/10 text-ink-muted hover:text-red-400 px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 shrink-0"
                >
                  <Trash2 size={12} aria-hidden="true" /> Remove
                </button>
              )}
              {p === 'youtube' && (
                <button
                  onClick={() => void runYoutubeTest()}
                  disabled={testing || !s?.configured}
                  className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 text-ink px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 shrink-0"
                >
                  {testing && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                  Test
                </button>
              )}
            </div>

            <p className="text-[11px] text-ink-muted max-w-xl">{HELP[p].use} {HELP[p].where}</p>

            {errors[p] && <p role="alert" className="text-[11px] text-red-400 break-words">{errors[p]}</p>}
            {notice[p] && !errors[p] && <p role="status" className="text-[11px] text-green-400">{notice[p]}</p>}
            {p === 'youtube' && ytTest && (
              <p role="status" className={`text-[11px] break-words ${ytTest.ok ? 'text-green-400' : 'text-red-400'}`}>
                {ytTest.ok ? 'The YouTube API accepted this key.' : `${ytTest.error ?? 'Test failed'} (${ytTest.kind ?? 'unavailable'})`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
