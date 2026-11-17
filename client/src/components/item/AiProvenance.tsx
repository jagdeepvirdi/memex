import { useEffect, useState } from 'react'
import { Bot, Cloud, HardDrive, Loader2, ShieldCheck } from 'lucide-react'
import { fetchAiProviders } from '../../lib/api'
import type { AiProviderId, AiProviderInfo } from '../../lib/api'
import { AI_PROVIDER_IDS, AI_PROVIDER_META } from '../../lib/aiProviders'
import type { Item } from '../../../../shared/types'

/** What `items.extraction_model` (`<provider>:<model>`) means, in words. */
export interface ExtractionModelInfo {
  provider: string
  model: string
  /** Display name, e.g. "Gemini". */
  name: string
  /** True when the text was sent to a cloud provider to get this answer. */
  cloud: boolean
}

export function describeExtractionModel(label: string | undefined | null): ExtractionModelInfo | null {
  if (!label || !label.trim()) return null
  const at = label.indexOf(':')
  const provider = at > 0 ? label.slice(0, at) : 'unknown'
  const model = at > 0 ? label.slice(at + 1) : label
  const known = (AI_PROVIDER_IDS as string[]).includes(provider) ? AI_PROVIDER_META[provider as AiProviderId] : null
  return {
    provider,
    model,
    name: known ? known.shortName : provider === 'unknown' ? 'an AI' : provider,
    cloud: provider !== 'ollama' && provider !== 'unknown',
  }
}

const chip = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium'

/** "Which AI answered", and whether the item is kept on this machine. Shown next to the item's other badges. */
export function AiBadge({ item }: { item: Pick<Item, 'extractionModel' | 'localOnly'> }) {
  const info = describeExtractionModel(item.extractionModel)
  return (
    <>
      {info ? (
        <span
          data-testid="ai-badge"
          className={`${chip} ${info.cloud ? 'bg-sky-500/10 border-sky-500/20 text-sky-300' : 'bg-white/5 border-white/5 text-ink-muted'}`}
          title={info.cloud
            ? `The text of this item was sent to ${info.name} to classify it.`
            : 'Classified on this machine. Nothing was sent anywhere.'}
        >
          {info.cloud ? <Cloud size={12} aria-hidden="true" /> : <HardDrive size={12} aria-hidden="true" />}
          {info.cloud ? `Classified by ${info.name}` : 'Classified locally'}
          <span className="opacity-70 font-mono">{info.model}</span>
        </span>
      ) : (
        <span data-testid="ai-badge" className={`${chip} bg-white/5 border-white/5 text-ink-muted`} title="This item has no record of which AI classified it.">
          <Bot size={12} aria-hidden="true" /> AI: not recorded
        </span>
      )}
      {item.localOnly && (
        <span
          data-testid="local-only-badge"
          className={`${chip} bg-emerald-500/10 border-emerald-500/20 text-emerald-300`}
          title={item.localOnly.message}
        >
          <ShieldCheck size={12} aria-hidden="true" /> Stays on this machine
        </span>
      )}
    </>
  )
}

interface ControlProps {
  item: Pick<Item, 'localOnly'>
  busy: boolean
  /** Runs the re-classification. `undefined` = the normal routing set in Settings. */
  onRun: (provider?: AiProviderId) => void
}

/**
 * "Re-classify" with a choice of AI. The default is the normal routing; picking a provider pins this one run to it. A
 * cloud provider is unavailable for an item that stays on this machine, and for a provider without a key.
 */
export function ReClassifyControl({ item, busy, onRun }: ControlProps) {
  const [providers, setProviders] = useState<AiProviderInfo[] | null>(null)
  const [choice, setChoice] = useState<'' | AiProviderId>('')

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => fetchAiProviders())
      .then((p) => { if (!cancelled) setProviders(p) })
      .catch(() => { if (!cancelled) setProviders(null) })
    return () => { cancelled = true }
  }, [])

  const disabledReason = (id: AiProviderId): string | null => {
    if (id === 'ollama') return null
    if (item.localOnly) return 'private item'
    const p = providers?.find((x) => x.id === id)
    return p && !p.configured ? 'no key' : null
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Re-classify with"
        value={choice}
        disabled={busy}
        onChange={(e) => setChoice(e.target.value as '' | AiProviderId)}
        className="bg-bg border border-white/10 rounded-lg px-2 py-1 text-[10px] text-ink-muted outline-none cursor-pointer focus:border-accent/50 disabled:opacity-50"
      >
        <option value="">Default AI</option>
        {AI_PROVIDER_IDS.map((id) => {
          const why = disabledReason(id)
          return (
            <option key={id} value={id} disabled={!!why}>
              {AI_PROVIDER_META[id].label}{why ? ` (${why})` : ''}
            </option>
          )
        })}
      </select>
      <button
        onClick={() => onRun(choice === '' ? undefined : choice)}
        disabled={busy}
        className="flex items-center gap-1.5 text-[10px] text-ink-muted hover:text-accent border border-white/10 hover:border-accent/30 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
        title="Re-run AI classification and add to history"
      >
        {busy ? <Loader2 size={10} className="animate-spin" /> : <Bot size={10} />}
        Re-classify
      </button>
    </div>
  )
}
