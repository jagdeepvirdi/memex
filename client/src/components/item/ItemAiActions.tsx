import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Sparkles, ChefHat, RefreshCw, Video } from 'lucide-react'
import {
  ApiError,
  explainItem,
  extractRecipeFromItem,
  fetchAiProviders,
  fetchDerivedItems,
  fetchItem,
} from '../../lib/api'
import type { AiProviderId, AiProviderInfo } from '../../lib/api'
import type { ExplanationData, Item } from '../../../../shared/types'

// ── Which items get these actions ─────────────────────────────────────────────

const YOUTUBE_URL = /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i

function isVideoItem(item: Item): boolean {
  const s = item.structured as Record<string, unknown>
  return typeof s?.videoId === 'string' || YOUTUBE_URL.test(item.sourceUrl ?? '')
}

/** Videos and saved links can be explained; recipes can additionally be pulled out of them. */
export function aiActionsFor(item: Item): { explain: boolean; extractRecipe: boolean; recipeLikely: boolean } {
  if (item.encrypted || item.type === 'password') return { explain: false, extractRecipe: false, recipeLikely: false }
  const eligible = isVideoItem(item) || item.type === 'link'
  const s = item.structured as Record<string, unknown>
  return {
    explain: eligible,
    extractRecipe: eligible && item.type !== 'recipe',
    recipeLikely: s?.videoKind === 'recipe',
  }
}

const PROVIDER_LABEL: Record<AiProviderId, string> = {
  ollama: 'Ollama (local)',
  claude: 'Claude (cloud)',
  gemini: 'Gemini (cloud)',
}

// ── Components ────────────────────────────────────────────────────────────────

function ExplanationCard({ e }: { e: ExplanationData }) {
  return (
    <div data-testid="explanation" className="bg-white/3 border border-white/5 rounded-xl px-6 py-4 flex flex-col gap-3">
      <p className="text-sm text-ink leading-relaxed">{e.summary}</p>
      {e.keyPoints.length > 0 && (
        <div>
          <h4 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold mb-1.5">Key points</h4>
          <ul className="list-disc pl-5 text-sm text-ink-muted space-y-1">
            {e.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      {e.steps.length > 0 && (
        <div>
          <h4 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold mb-1.5">Steps</h4>
          <ol className="list-decimal pl-5 text-sm text-ink-muted space-y-1">
            {e.steps.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        </div>
      )}
      {e.takeaways.length > 0 && (
        <div>
          <h4 className="text-[10px] text-ink-muted uppercase tracking-widest font-bold mb-1.5">Takeaways</h4>
          <ul className="list-disc pl-5 text-sm text-ink-muted space-y-1">
            {e.takeaways.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-ink-muted/70 font-mono">
        {e.model} · from {e.basis}{e.truncated ? ' (long source, abridged)' : ''}
      </p>
    </div>
  )
}

interface Props {
  item: Item
  onItemUpdated: (item: Item) => void
}

/** "Explain" and "Extract recipe" for videos and saved links. Nothing runs unless the user clicks. */
export default function ItemAiActions({ item, onItemUpdated }: Props) {
  const actions = aiActionsFor(item)
  const [providers, setProviders] = useState<AiProviderInfo[] | null>(null)
  const [provider, setProvider] = useState<'' | AiProviderId>('')
  const [explaining, setExplaining] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [recipes, setRecipes] = useState<Item[]>([])
  const [noRecipe, setNoRecipe] = useState<string | null>(null)

  const active = actions.explain || actions.extractRecipe

  useEffect(() => {
    if (!active) return
    let live = true
    fetchAiProviders().then(p => { if (live) setProviders(p) }).catch(() => {})
    fetchDerivedItems(item.id)
      .then(list => { if (live) setRecipes(list.filter(i => i.type === 'recipe')) })
      .catch(() => {})
    return () => { live = false }
  }, [item.id, active])

  if (!active) return null

  const explanation = (item.structured as { explanation?: ExplanationData }).explanation
  const choice = provider || undefined

  const handleExplain = async () => {
    setExplaining(true)
    try {
      const res = await explainItem(item.id, { provider: choice, force: !!explanation })
      onItemUpdated(res.item)
      toast.success('Explanation saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to explain')
    } finally {
      setExplaining(false)
    }
  }

  const handleExtract = async () => {
    setExtracting(true)
    setNoRecipe(null)
    try {
      const res = await extractRecipeFromItem(item.id, { provider: choice, force: recipes.length > 0 })
      setRecipes(prev => [res.recipe, ...prev])
      toast.success('Recipe saved as a new item — review it in the queue')
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.body?.found === false) {
        setNoRecipe(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to extract recipe')
      }
    } finally {
      setExtracting(false)
    }
  }

  const busy = explaining || extracting
  const primary = 'bg-accent/10 hover:bg-accent/20 text-accent border-accent/20'
  const secondary = 'bg-white/5 hover:bg-white/10 text-ink-muted border-white/10'

  return (
    <section data-testid="ai-actions" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {actions.explain && (
          <button
            onClick={handleExplain}
            disabled={busy}
            className={`flex items-center gap-2 text-xs border px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40 ${actions.recipeLikely ? secondary : primary}`}
          >
            {explaining ? <Loader2 size={12} className="animate-spin" /> : explanation ? <RefreshCw size={12} /> : <Sparkles size={12} />}
            {explaining ? 'Explaining…' : explanation ? 'Explain again' : 'Explain this'}
          </button>
        )}
        {actions.extractRecipe && (
          <button
            onClick={handleExtract}
            disabled={busy}
            className={`flex items-center gap-2 text-xs border px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40 ${actions.recipeLikely ? primary : secondary}`}
          >
            {extracting ? <Loader2 size={12} className="animate-spin" /> : <ChefHat size={12} />}
            {extracting ? 'Extracting…' : recipes.length > 0 ? 'Extract another recipe' : 'Extract recipe'}
          </button>
        )}
        <label className="flex items-center gap-1.5 text-[11px] text-ink-muted ml-auto">
          Run on
          <select
            aria-label="AI provider"
            value={provider}
            onChange={e => setProvider(e.target.value as '' | AiProviderId)}
            disabled={busy}
            className="bg-bg border border-white/10 rounded-md px-2 py-1 text-xs text-ink outline-none focus:border-accent/50"
          >
            <option value="">Default (Settings)</option>
            {(['ollama', 'claude', 'gemini'] as const).map(id => {
              const info = providers?.find(p => p.id === id)
              return (
                <option key={id} value={id} disabled={!!providers && !info?.configured}>
                  {PROVIDER_LABEL[id]}{providers && !info?.configured ? ' — no key' : ''}
                </option>
              )
            })}
          </select>
        </label>
      </div>

      {noRecipe && (
        <p role="status" className="text-xs text-ink-muted bg-white/3 border border-white/5 rounded-lg px-3 py-2">
          {noRecipe} Nothing was saved.
        </p>
      )}

      {recipes.length > 0 && (
        <ul data-testid="derived-recipes" className="flex flex-col gap-1.5">
          {recipes.map(r => (
            <li key={r.id} className="text-xs">
              <Link to={`/item/${r.id}`} className="text-accent hover:underline flex items-center gap-1.5 w-fit">
                <ChefHat size={12} /> Recipe: {r.title}
                {!r.reviewed && <span className="text-[10px] text-ink-muted">(needs review)</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {explanation && <ExplanationCard e={explanation} />}
    </section>
  )
}

/** On a derived item (e.g. an extracted recipe): link back to the item it came from. */
export function DerivedFromLink({ itemId }: { itemId: string }) {
  const [parent, setParent] = useState<Pick<Item, 'id' | 'title'> | null>(null)
  useEffect(() => {
    let live = true
    fetchItem(itemId).then(p => { if (live) setParent(p) }).catch(() => {})
    return () => { live = false }
  }, [itemId])

  return (
    <Link
      data-testid="derived-from"
      to={`/item/${itemId}`}
      className="flex items-center gap-2 text-xs text-accent bg-accent/5 px-3 py-1.5 rounded-lg border border-accent/10 hover:bg-accent/10 transition-all w-fit"
    >
      <Video size={13} /> From: {parent?.title ?? 'original item'}
    </Link>
  )
}
