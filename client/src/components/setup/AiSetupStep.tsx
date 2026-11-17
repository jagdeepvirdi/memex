import { useEffect, useState } from 'react'
import { AlertCircle, Check, Cloud, HardDrive, Loader2, ShieldCheck } from 'lucide-react'
import { apiFetch, saveApiKey, setEmbeddingModel, testAiProvider } from '../../lib/api'
import type { AiProviderId, ApiKeyProvider } from '../../lib/api'

// First-run AI setup, in the order that works: (1) save the key, (2) turn on cloud AI with the user's consent,
// (3) test the connection, (4) switch search (embeddings) to the cloud. Embeddings default to Ollama, and saving a note
// embeds it right away, so skipping step 4 on a machine without Ollama makes every save fail.

type CloudProvider = Exclude<AiProviderId, 'ollama'>
type EmbedProvider = 'gemini' | 'openai'

interface CloudInfo {
  id: CloudProvider
  name: string
  /** Can this provider make embeddings (search)? Claude and Groq have no embeddings API. */
  canEmbed: boolean
  getKey: string
  blurb: string
}

export const CLOUD_PROVIDERS: CloudInfo[] = [
  { id: 'gemini', name: 'Gemini', canEmbed: true, getKey: 'aistudio.google.com', blurb: 'Answers and search from one key. A good default.' },
  { id: 'openai', name: 'OpenAI', canEmbed: true, getKey: 'platform.openai.com', blurb: 'Answers and search from one key.' },
  { id: 'claude', name: 'Claude', canEmbed: false, getKey: 'console.anthropic.com', blurb: 'Answers only. Search needs a Gemini or OpenAI key too, or local Ollama.' },
  { id: 'groq', name: 'Groq', canEmbed: false, getKey: 'console.groq.com', blurb: 'Fast open models. Answers only. Search needs a Gemini or OpenAI key too, or local Ollama.' },
]

type Choice = 'cloud' | 'local' | null
/** 'same' = the chosen provider (when it can embed); otherwise a specific embedding provider or local Ollama. */
type EmbedChoice = 'same' | EmbedProvider | 'local'

type StepState = 'pending' | 'running' | 'done' | 'failed'
interface Progress { label: string; state: StepState }

const inputCls =
  'w-full bg-bg border border-white/10 rounded-xl py-2.5 px-3 text-sm text-ink outline-none focus:border-accent/50 transition-all placeholder:text-ink-muted/40 font-mono'

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

/**
 * Some providers put a JSON document in their error text ({"error":{"message":"..."}}). Show the sentence, not the
 * document, and keep a very long message short enough to read.
 */
export function readableProviderError(raw: string | undefined): string {
  if (!raw) return 'unknown error'
  const start = raw.indexOf('{')
  if (start >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as { error?: { message?: string } | string; message?: string }
      const inner = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message
      if (typeof inner === 'string' && inner.trim()) return inner.trim()
    } catch { /* not JSON: fall through */ }
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}...` : raw
}

interface Props {
  /** Called when setup is finished or skipped. */
  onDone: () => void
}

export function AiSetupStep({ onDone }: Props) {
  const [choice, setChoice] = useState<Choice>(null)
  const [provider, setProvider] = useState<CloudProvider>('gemini')
  const [key, setKey] = useState('')
  const [consent, setConsent] = useState(false)
  const [embedChoice, setEmbedChoice] = useState<EmbedChoice>('same')
  const [embedKey, setEmbedKey] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ollama, setOllama] = useState<'checking' | 'ok' | 'offline'>('checking')

  const info = CLOUD_PROVIDERS.find((p) => p.id === provider)!
  // A provider that cannot embed needs a separate embedding choice; one that can defaults to itself.
  const effectiveEmbed: EmbedChoice = info.canEmbed ? (embedChoice === 'same' || embedChoice === 'local' ? embedChoice : 'same') : (embedChoice === 'same' ? 'gemini' : embedChoice)
  const embedProvider: EmbedProvider | null =
    effectiveEmbed === 'local' ? null : effectiveEmbed === 'same' ? (provider as EmbedProvider) : effectiveEmbed
  const needsSecondKey = embedProvider !== null && embedProvider !== provider
  const ready = key.trim().length > 0 && consent && (!needsSecondKey || embedKey.trim().length > 0) && !running

  useEffect(() => {
    if (choice !== 'local') return
    let cancelled = false
    setOllama('checking')
    apiFetch<{ status: string }>('/health/ollama')
      .then((r) => { if (!cancelled) setOllama(r.status === 'ok' ? 'ok' : 'offline') })
      .catch(() => { if (!cancelled) setOllama('offline') })
    return () => { cancelled = true }
  }, [choice])

  const setStep = (index: number, state: StepState) =>
    setProgress((p) => p.map((s, i) => (i === index ? { ...s, state } : s)))

  const finishCloud = async () => {
    const labels = [
      `Saving your ${info.name} key`,
      'Turning on cloud AI (your consent)',
      `Testing the connection to ${info.name}`,
      ...(embedProvider ? [`Switching search to ${embedProvider === 'gemini' ? 'Gemini' : 'OpenAI'}`] : []),
    ]
    setProgress(labels.map((label) => ({ label, state: 'pending' as StepState })))
    setError(null)
    setRunning(true)
    let at = 0
    try {
      // 1. keys
      setStep(at, 'running')
      await saveApiKey(provider as ApiKeyProvider, key.trim())
      if (needsSecondKey && embedProvider) await saveApiKey(embedProvider, embedKey.trim())
      setStep(at, 'done'); at++

      // 2. provider + consent
      setStep(at, 'running')
      await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ ai_provider: provider, allow_cloud: true }) })
      setStep(at, 'done'); at++

      // 3. test (needs the key and the consent from the steps above)
      setStep(at, 'running')
      const test = await testAiProvider(provider)
      if (!test.ok) {
        throw new Error(
          test.kind === 'auth'
            ? `${info.name} rejected the key. Check that you copied all of it, then try again.`
            : `${info.name} did not answer: ${readableProviderError(test.error)}`,
        )
      }
      setStep(at, 'done'); at++

      // 4. embeddings (only when they come from the cloud)
      if (embedProvider) {
        setStep(at, 'running')
        await setEmbeddingModel(embedProvider)
        setStep(at, 'done'); at++
      }
      onDone()
    } catch (err) {
      setStep(at, 'failed')
      setError(message(err, 'Setup failed. Check your connection and try again.'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-surface p-8 md:p-10 rounded-3xl border border-white/5 shadow-2xl space-y-6" data-testid="ai-setup">
      <div className="space-y-2 text-center">
        <h2 className="font-display text-3xl text-ink">How should Memex think?</h2>
        <p className="text-ink-muted text-sm max-w-md mx-auto">
          Memex needs an AI to classify your notes, answer questions and find things by meaning. Pick where it runs. You can change this any time in Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="group" aria-label="Where the AI runs">
        <button
          type="button"
          aria-pressed={choice === 'local'}
          onClick={() => { setChoice('local'); setError(null) }}
          className={`p-5 rounded-2xl border text-left transition-all flex flex-col gap-2 ${choice === 'local' ? 'bg-accent/10 border-accent text-accent' : 'bg-white/5 border-white/5 hover:border-white/20 text-ink-muted hover:text-ink'}`}
        >
          <HardDrive size={22} aria-hidden="true" />
          <span className="font-bold text-ink">On my computer (Ollama)</span>
          <span className="text-xs opacity-80 leading-relaxed">Free and private: nothing leaves your machine. Needs Ollama installed.</span>
        </button>
        <button
          type="button"
          aria-pressed={choice === 'cloud'}
          onClick={() => { setChoice('cloud'); setError(null) }}
          className={`p-5 rounded-2xl border text-left transition-all flex flex-col gap-2 ${choice === 'cloud' ? 'bg-accent/10 border-accent text-accent' : 'bg-white/5 border-white/5 hover:border-white/20 text-ink-muted hover:text-ink'}`}
        >
          <Cloud size={22} aria-hidden="true" />
          <span className="font-bold text-ink">In the cloud (my own key)</span>
          <span className="text-xs opacity-80 leading-relaxed">Gemini, OpenAI, Claude or Groq. No Ollama needed. You pay the provider for what you use.</span>
        </button>
      </div>

      {choice === 'local' && (
        <div className="space-y-4" data-testid="ai-setup-local">
          <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3 text-sm">
            {ollama === 'checking' && <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden="true" />}
            {ollama === 'ok' && <Check size={16} className="text-green-500" aria-hidden="true" />}
            {ollama === 'offline' && <AlertCircle size={16} className="text-amber-400" aria-hidden="true" />}
            <span className="text-ink" role="status">
              {ollama === 'checking' ? 'Looking for Ollama...' : ollama === 'ok' ? 'Ollama is running.' : 'Ollama is not running yet.'}
            </span>
          </div>
          {ollama !== 'ok' && (
            <ol className="text-xs text-ink-muted space-y-1 list-decimal list-inside">
              <li>Install Ollama from <span className="font-mono">ollama.com</span> and start it.</li>
              <li>Run <code className="bg-bg px-1 rounded">ollama pull llama3.2</code></li>
              <li>Run <code className="bg-bg px-1 rounded">ollama pull nomic-embed-text</code></li>
            </ol>
          )}
          <p className="text-xs text-ink-muted">You can continue now and finish this later: Memex will keep working as soon as Ollama is running.</p>
          <button type="button" onClick={onDone} className="bg-accent hover:bg-accent-dark text-bg font-bold py-3 px-6 rounded-xl">
            Continue with local AI
          </button>
        </div>
      )}

      {choice === 'cloud' && (
        <div className="space-y-5" data-testid="ai-setup-cloud">
          <fieldset className="space-y-2" disabled={running}>
            <legend className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-2">Provider</legend>
            <div className="grid grid-cols-2 gap-2">
              {CLOUD_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={provider === p.id}
                  onClick={() => { setProvider(p.id); setEmbedChoice('same'); setError(null) }}
                  className={`p-3 rounded-xl border text-left text-sm transition-all ${provider === p.id ? 'bg-accent/10 border-accent text-ink' : 'bg-white/5 border-white/5 text-ink-muted hover:text-ink'}`}
                >
                  <span className="font-bold">{p.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">{info.blurb}</p>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="ai-setup-key" className="text-xs font-bold uppercase tracking-widest text-ink-muted">{info.name} API key</label>
            <input
              id="ai-setup-key"
              type="password"
              autoComplete="off"
              value={key}
              disabled={running}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your key"
              className={inputCls}
            />
            <p className="text-[11px] text-ink-muted">Get one at <span className="font-mono">{info.getKey}</span>. It is stored encrypted on this machine and never shown again.</p>
          </div>

          <fieldset className="space-y-2" disabled={running}>
            <legend className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-1">Search (finding notes by meaning)</legend>
            {info.canEmbed ? (
              <>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="radio" name="embed" checked={effectiveEmbed === 'same'} onChange={() => setEmbedChoice('same')} className="mt-1" />
                  <span>Use {info.name} for search too <span className="text-ink-muted">(recommended)</span></span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="radio" name="embed" checked={effectiveEmbed === 'local'} onChange={() => setEmbedChoice('local')} className="mt-1" />
                  <span>Keep search on my computer <span className="text-ink-muted">(needs Ollama running)</span></span>
                </label>
              </>
            ) : (
              <>
                <p className="text-xs text-ink-muted">{info.name} cannot make the vectors search needs. Choose where search runs:</p>
                {(['gemini', 'openai'] as const).map((p) => (
                  <label key={p} className="flex items-start gap-2 text-sm text-ink">
                    <input type="radio" name="embed" checked={effectiveEmbed === p} onChange={() => setEmbedChoice(p)} className="mt-1" />
                    <span>{p === 'gemini' ? 'Gemini' : 'OpenAI'} <span className="text-ink-muted">(needs a {p === 'gemini' ? 'Gemini' : 'OpenAI'} key)</span></span>
                  </label>
                ))}
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="radio" name="embed" checked={effectiveEmbed === 'local'} onChange={() => setEmbedChoice('local')} className="mt-1" />
                  <span>On my computer <span className="text-ink-muted">(needs Ollama running)</span></span>
                </label>
              </>
            )}
            {needsSecondKey && (
              <div className="space-y-1.5 pt-1">
                <label htmlFor="ai-setup-embed-key" className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                  {embedProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API key (for search)
                </label>
                <input id="ai-setup-embed-key" type="password" autoComplete="off" value={embedKey} disabled={running} onChange={(e) => setEmbedKey(e.target.value)} placeholder="Paste your key" className={inputCls} />
              </div>
            )}
          </fieldset>

          <label className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/5 text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={consent} disabled={running} onChange={(e) => setConsent(e.target.checked)} className="mt-1" aria-label="I agree to send my notes to the cloud provider" />
            <span className="space-y-1">
              <span className="block font-medium flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-400" aria-hidden="true" /> I agree to send my notes to {info.name}</span>
              <span className="block text-xs text-ink-muted leading-relaxed">
                Memex sends the text of notes you save, and your questions, to the provider you chose, so it can classify and answer.
                Items in the Passwords or Personal categories, items tagged private, no-cloud or local-only, and vault items are never sent.
                You can turn this off any time (Settings → AI, or Strict Local Mode).
              </span>
            </span>
          </label>

          {progress.length > 0 && (
            <ol className="space-y-1.5" aria-label="Setup progress">
              {progress.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-sm" data-state={s.state}>
                  {s.state === 'running' && <Loader2 size={14} className="animate-spin text-accent" aria-hidden="true" />}
                  {s.state === 'done' && <Check size={14} className="text-green-500" aria-hidden="true" />}
                  {s.state === 'failed' && <AlertCircle size={14} className="text-red-400" aria-hidden="true" />}
                  {s.state === 'pending' && <span className="w-3.5 h-3.5 rounded-full border border-white/20" aria-hidden="true" />}
                  <span className={s.state === 'pending' ? 'text-ink-muted' : 'text-ink'}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400 flex items-start gap-2 break-words min-w-0">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}

          <button
            type="button"
            onClick={finishCloud}
            disabled={!ready}
            className="bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-bg font-bold py-3 px-6 rounded-xl inline-flex items-center gap-2"
          >
            {running && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {error ? 'Try again' : 'Set up cloud AI'}
          </button>
        </div>
      )}

      <div className="text-center pt-2">
        <button type="button" onClick={onDone} disabled={running} className="text-[11px] text-ink-muted hover:text-accent uppercase tracking-widest transition-colors disabled:opacity-40">
          Skip for now (use local AI by default)
        </button>
      </div>
    </div>
  )
}
