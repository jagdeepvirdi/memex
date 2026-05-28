import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2, Zap, Tag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/sidebar/Sidebar'
import ItemCard from '../components/cards/ItemCard'
import { CardSkeleton } from '../components/Skeleton'
import { fetchItems } from '../lib/api'
import type { Item, ItemType } from '../../../shared/types'

const TYPE_FILTERS: { label: string; value: ItemType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Notes', value: 'note' },
  { label: 'Recipes', value: 'recipe' },
  { label: 'Media', value: 'media' },
  { label: 'Books', value: 'book' },
  { label: 'Links', value: 'link' },
  { label: 'Stocks', value: 'stock' },
  { label: 'Specs', value: 'spec' },
]

export default function EnrichedItemsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    fetchItems({
      enriched: true,
      type: typeFilter === 'all' ? undefined : typeFilter,
      limit: 100,
    })
      .then(res => { setItems(res.items); setTotal(res.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [typeFilter])

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="dashboard" />
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/5 flex items-center gap-6 px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10">
          <button onClick={() => navigate('/')} className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-yellow-400" />
            <h1 className="font-display text-lg text-ink">AI Enriched Notes</h1>
          </div>
          {!loading && (
            <span className="text-xs text-ink-muted bg-white/5 px-2 py-1 rounded-lg">
              {total} enriched
            </span>
          )}
        </header>

        <div className="p-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
          {/* Type filter pills */}
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                  typeFilter === f.value
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-white/5 text-ink-muted border-white/10 hover:text-ink hover:bg-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Info banner — tags are set during enrichment */}
          <div className="flex items-start gap-3 bg-accent/5 border border-accent/20 rounded-xl p-4">
            <Tag size={16} className="text-accent mt-0.5 shrink-0" />
            <p className="text-xs text-ink-muted">
              Each enriched note has been <span className="text-ink font-medium">auto-tagged</span> by Ollama with type, categories, and tags.
              Search by tag from the sidebar, or use <kbd className="bg-white/10 px-1 rounded text-[10px]">⌘K</kbd> to search everything.
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
              <Zap size={40} className="text-ink-muted/30" />
              <p className="text-sm">No enriched notes yet. Run enrichment from Settings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map(item => (
                <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />
              ))}
              {total > 100 && (
                <p className="col-span-full text-center text-sm text-ink-muted py-4">
                  Showing first 100 of {total}. Use search (⌘K) to find specific notes.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
