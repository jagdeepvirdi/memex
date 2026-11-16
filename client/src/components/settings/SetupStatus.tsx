import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cloud, Cpu, KeyRound, ShieldCheck } from 'lucide-react'
import { fetchAiProviders } from '../../lib/api'
import type { AiProviderId, AiProviderInfo } from '../../lib/api'
import { AI_PROVIDER_IDS, AI_PROVIDER_META } from '../../lib/aiProviders'
import { resolveAiSettings } from '../../lib/aiSettings'
import { settingsTabPath } from './settingsTabs'

interface Props {
  settings: Record<string, any>
}

const chip = 'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-ink-muted'

/**
 * One line that answers "what is Memex actually doing right now?" at the top of every Settings tab: which AI
 * answers, whether cloud is allowed, and which cloud keys exist. It explains a fallback to Ollama instead of
 * leaving you to work it out from five separate switches.
 */
export function SetupStatus({ settings }: Props) {
  const [providers, setProviders] = useState<AiProviderInfo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAiProviders()
      .then(p => { if (!cancelled) setProviders(p) })
      .catch(() => { /* the line still renders from the settings alone */ })
    return () => { cancelled = true }
  }, [])

  const { strictLocal, provider, allowCloud } = resolveAiSettings(settings)
  const info = (id: AiProviderId) => providers?.find(p => p.id === id)

  // What would really answer: the selected provider, unless something forces it back to Ollama.
  let effective: AiProviderId = provider
  let fallbackReason: string | null = null
  if (provider !== 'ollama') {
    if (!allowCloud) {
      effective = 'ollama'
      fallbackReason = 'cloud AI is not allowed'
    } else if (providers && !info(provider)?.configured) {
      effective = 'ollama'
      fallbackReason = `${AI_PROVIDER_META[provider].shortName} has no API key`
    }
  }

  const model: string =
    settings[AI_PROVIDER_META[effective].modelKey] ?? info(effective)?.models[0] ?? (effective === 'ollama' ? 'llama3.2' : '')
  const withKeys = providers ? AI_PROVIDER_IDS.filter(id => id !== 'ollama' && info(id)?.configured) : null

  return (
    <div className="rounded-xl border border-white/5 bg-surface/40 p-4 space-y-2.5" data-testid="setup-status" aria-label="Setup status" role="region">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink">
        <Cpu size={14} className="text-accent shrink-0" aria-hidden="true" />
        <span className="text-ink-muted">Answering with</span>
        <span className="font-medium" data-testid="setup-effective">
          {AI_PROVIDER_META[effective].label}{model ? ` · ${model}` : ''}
        </span>
      </p>

      {fallbackReason && (
        <p className="text-xs text-yellow-400" data-testid="setup-fallback">
          {AI_PROVIDER_META[provider].shortName} is selected, but {fallbackReason}, so Ollama is used instead.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {strictLocal ? (
          <span className={`${chip} border-green-500/20 bg-green-500/5 text-green-400`}>
            <ShieldCheck size={12} aria-hidden="true" /> Strict Local Mode
          </span>
        ) : (
          <span className={chip}>
            <Cloud size={12} aria-hidden="true" /> Cloud AI {allowCloud ? 'allowed' : 'off'}
          </span>
        )}
        {withKeys !== null && (
          <Link to={settingsTabPath('privacy')} className={`${chip} hover:text-ink transition-colors`}>
            <KeyRound size={12} aria-hidden="true" />
            {withKeys.length > 0 ? `Keys: ${withKeys.map(id => AI_PROVIDER_META[id].shortName).join(', ')}` : 'No cloud keys'}
          </Link>
        )}
      </div>
    </div>
  )
}
