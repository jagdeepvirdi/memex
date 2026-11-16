import { useEffect, useState } from 'react'
import { Check, AlertCircle, Loader2, Cloud, ShieldCheck } from 'lucide-react'
import { fetchAiProviders, testAiProvider } from '../../lib/api'
import type { AiProviderId, AiProviderInfo, AiTestResult } from '../../lib/api'
import { AI_PROVIDER_IDS, AI_PROVIDER_META } from '../../lib/aiProviders'
import { ApiKeysPanel } from './ApiKeysPanel'

interface Props {
  settings: Record<string, any>
  onUpdate: (patch: Record<string, any>) => void | Promise<void>
}

const PROVIDERS: AiProviderId[] = AI_PROVIDER_IDS
const LABEL = Object.fromEntries(PROVIDERS.map(id => [id, AI_PROVIDER_META[id].label])) as Record<AiProviderId, string>

// Task names must match the `task` passed to aiChat() on the server.
const TASKS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'classify', label: 'Classification', hint: 'Auto-classifying new and re-processed items' },
  { id: 'insights', label: 'Insights', hint: 'Dashboard insights' },
  { id: 'digest', label: 'Weekly digest', hint: 'The connection shown in your digest' },
  { id: 'ask', label: 'Ask Memex', hint: 'Answers over your library' },
  { id: 'summarize_links', label: 'Link summaries', hint: 'Summaries of URLs inside notes' },
  { id: 'nl_filter', label: 'Natural-language filters', hint: 'Turning a search phrase into filters' },
]

// Older versions of the UI saved booleans as the strings 'true' / 'false'.
const truthy = (v: unknown) => v === true || v === 'true'
const isProvider = (v: unknown): v is AiProviderId => PROVIDERS.includes(v as AiProviderId)

const selectCls =
  'bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink outline-none cursor-pointer focus:border-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export function AiProviderSettings({ settings, onUpdate }: Props) {
  const [providers, setProviders] = useState<AiProviderInfo[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [testing, setTesting] = useState<AiProviderId | null>(null)
  const [results, setResults] = useState<Partial<Record<AiProviderId, AiTestResult>>>({})

  // Bumped after a key is saved or removed so "configured" is re-read from the server.
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchAiProviders()
      .then(p => { if (!cancelled) { setProviders(p); setLoadFailed(false) } })
      .catch(() => { if (!cancelled) setLoadFailed(true) })
    return () => { cancelled = true }
  }, [reloadTick])

  const strictLocal = truthy(settings.strict_local_mode)
  const stored: AiProviderId = isProvider(settings.ai_provider)
    ? settings.ai_provider
    : truthy(settings.use_claude) ? 'claude' : 'ollama'
  const provider: AiProviderId = strictLocal ? 'ollama' : stored
  // Legacy installs only ever had `use_claude`, which also meant consent.
  const allowCloud = !strictLocal && (settings.allow_cloud !== undefined ? truthy(settings.allow_cloud) : truthy(settings.use_claude))
  const perTask: Record<string, AiProviderId> =
    settings.ai_task_providers && typeof settings.ai_task_providers === 'object' && !Array.isArray(settings.ai_task_providers)
      ? settings.ai_task_providers
      : {}

  const info = (id: AiProviderId) => providers?.find(p => p.id === id)
  const unavailable = (id: AiProviderId) => {
    const p = info(id)
    return !!p && p.cloud && !p.configured
  }

  const modelKey = AI_PROVIDER_META[provider].modelKey
  const currentModel: string = settings[modelKey] ?? (provider === 'ollama' ? 'llama3.2' : '')

  // Cloud model ids are free text (with suggestions); commit on blur/Enter so we don't save per keystroke.
  const [draft, setDraft] = useState(currentModel)
  useEffect(() => setDraft(currentModel), [currentModel, provider])
  const commitModel = () => {
    const v = draft.trim()
    if (v && v !== currentModel) onUpdate({ [modelKey]: v })
    else setDraft(currentModel)
  }

  const setTaskProvider = (task: string, value: string) => {
    const next = { ...perTask }
    if (value) next[task] = value as AiProviderId
    else delete next[task]
    onUpdate({ ai_task_providers: next })
  }

  const runTest = async (id: AiProviderId) => {
    setTesting(id)
    setResults(r => { const n = { ...r }; delete n[id]; return n })
    try {
      const res = await testAiProvider(id)
      setResults(r => ({ ...r, [id]: res }))
    } catch (err) {
      setResults(r => ({
        ...r,
        [id]: { ok: false, provider: id, kind: 'unavailable', error: err instanceof Error ? err.message : 'Test failed' },
      }))
    } finally {
      setTesting(null)
    }
  }

  const cloudSelected = provider !== 'ollama'
  const taskUsesCloud = Object.values(perTask).some(p => p !== 'ollama')

  return (
    <div className="space-y-6" data-testid="ai-provider-settings">
      {strictLocal && (
        <div className="flex items-start gap-2.5 rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-xs text-green-400">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Strict Local Mode is on — all AI runs on local Ollama and cloud providers are never called.
            Turn it off under Vault Security to use a cloud provider.
          </p>
        </div>
      )}

      {/* Default provider + model */}
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-sm text-ink font-medium">AI Provider</p>
          <p className="text-xs text-ink-muted mt-0.5">Default for classification, insights and Ask. Local Ollama unless you choose otherwise.</p>
        </div>
        <select
          aria-label="AI provider"
          className={selectCls}
          value={provider}
          disabled={strictLocal}
          onChange={e => onUpdate({ ai_provider: e.target.value })}
        >
          {PROVIDERS.map(id => (
            <option key={id} value={id} disabled={id !== provider && unavailable(id)}>
              {LABEL[id]}{unavailable(id) ? ' — no API key' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-sm text-ink font-medium">Model</p>
          <p className="text-xs text-ink-muted mt-0.5">
            {provider === 'ollama' ? 'Installed Ollama models.' : 'Model id for this provider — pick a suggestion or type your own.'}
          </p>
        </div>
        {provider === 'ollama' ? (
          <select
            aria-label="Model"
            className={selectCls}
            value={currentModel}
            onChange={e => onUpdate({ ai_model: e.target.value })}
          >
            {[...new Set([currentModel, ...(info('ollama')?.models ?? [])])].filter(Boolean).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              aria-label="Model"
              list={`ai-models-${provider}`}
              className="bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink font-mono outline-none focus:border-accent/50 transition-colors w-56"
              value={draft}
              placeholder={info(provider)?.models[0] ?? ''}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitModel}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
            <datalist id={`ai-models-${provider}`}>
              {(info(provider)?.models ?? []).map(m => <option key={m} value={m} />)}
            </datalist>
          </>
        )}
      </div>

      {/* Cloud consent */}
      <div className="flex items-center justify-between gap-6 pt-4 border-t border-white/5">
        <div>
          <p className="text-sm text-ink font-medium flex items-center gap-1.5"><Cloud size={14} aria-hidden="true" /> Allow cloud AI</p>
          <p className="text-xs text-ink-muted mt-0.5 max-w-md">
            Lets the selected cloud provider (Claude, Gemini or OpenAI) receive item content, as the default or per task. Nothing is sent without this.
            Passwords, Personal items and anything tagged <code className="bg-white/10 px-1 rounded">private</code>,{' '}
            <code className="bg-white/10 px-1 rounded">no-cloud</code> or <code className="bg-white/10 px-1 rounded">local-only</code> always stay local.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            role="switch"
            aria-label="Allow cloud AI"
            className="sr-only peer"
            checked={allowCloud}
            disabled={strictLocal}
            onChange={e => onUpdate({ allow_cloud: e.target.checked })}
          />
          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50" />
        </label>
      </div>

      {!strictLocal && !allowCloud && (cloudSelected || taskUsesCloud) && (
        <p role="alert" className="flex items-start gap-2 text-xs text-yellow-400">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          A cloud provider is selected but cloud AI is not allowed, so everything still runs locally. Turn on “Allow cloud AI” to use it.
        </p>
      )}

      {/* Per-task overrides */}
      <div className="pt-4 border-t border-white/5 space-y-3">
        <div>
          <p className="text-sm text-ink font-medium">Per-task provider</p>
          <p className="text-xs text-ink-muted mt-0.5">Override the default for individual features.</p>
        </div>
        {TASKS.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-6">
            <div>
              <p className="text-xs text-ink">{t.label}</p>
              <p className="text-[11px] text-ink-muted">{t.hint}</p>
            </div>
            <select
              aria-label={`${t.label} provider`}
              className={selectCls}
              value={perTask[t.id] ?? ''}
              disabled={strictLocal}
              onChange={e => setTaskProvider(t.id, e.target.value)}
            >
              <option value="">Default ({LABEL[provider]})</option>
              {PROVIDERS.map(id => (
                <option key={id} value={id} disabled={id !== perTask[t.id] && unavailable(id)}>
                  {LABEL[id]}{unavailable(id) ? ' — no API key' : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <ApiKeysPanel onChanged={() => setReloadTick(t => t + 1)} />

      {/* Provider status + connection tests */}
      <div className="pt-4 border-t border-white/5 space-y-3">
        <div>
          <p className="text-sm text-ink font-medium">Providers</p>
          <p className="text-xs text-ink-muted mt-0.5">
            Availability of each provider and a connection test. Add or change keys in “API keys” above; keys set in the
            server's <code className="bg-white/10 px-1 rounded">.env</code> need a server restart.
          </p>
        </div>
        {loadFailed && <p className="text-xs text-red-400">Couldn't load provider status.</p>}
        {PROVIDERS.map(id => {
          const p = info(id)
          const res = results[id]
          const needsConsent = id !== 'ollama' && !allowCloud
          return (
            <div key={id} className="flex items-start justify-between gap-6" data-testid={`provider-row-${id}`}>
              <div className="min-w-0">
                <p className="text-xs text-ink flex items-center gap-2">
                  {LABEL[id]}
                  {p === undefined ? null : id === 'ollama' ? (
                    <span className="text-[10px] text-ink-muted">always available</span>
                  ) : p.configured ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-400"><Check size={10} aria-hidden="true" /> Key configured</span>
                  ) : (
                    <span className="text-[10px] text-yellow-400">No API key</span>
                  )}
                </p>
                {res && (
                  <p role="status" className={`text-[11px] mt-1 break-words ${res.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {res.ok
                      ? `Working${res.model ? ` · ${res.model}` : ''}${res.latencyMs !== undefined ? ` · ${res.latencyMs} ms` : ''}`
                      : `${res.error ?? 'Test failed'}${res.kind ? ` (${res.kind.replace('_', ' ')})` : ''}`}
                  </p>
                )}
              </div>
              <button
                onClick={() => runTest(id)}
                disabled={testing !== null || (p !== undefined && id !== 'ollama' && !p.configured) || strictLocal && id !== 'ollama'}
                title={needsConsent && !strictLocal ? 'Turn on “Allow cloud AI” to test a cloud provider' : undefined}
                className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-ink px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 shrink-0"
              >
                {testing === id && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                Test {AI_PROVIDER_META[id].shortName}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
