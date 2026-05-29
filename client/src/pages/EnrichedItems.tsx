import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2, Zap, Tag, Trash2, Square, CheckSquare } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import Sidebar from '../components/sidebar/Sidebar'
import ItemCard from '../components/cards/ItemCard'
import { CardSkeleton } from '../components/Skeleton'
import { fetchItems, deleteItemsBulk } from '../lib/api'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const typeFilter = (searchParams.get('type') as ItemType | 'all') || 'all'
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const limit = 48

  useEffect(() => {
    setLoading(true)
    fetchItems({
      enriched: true,
      type: typeFilter === 'all' ? undefined : typeFilter,
      limit,
      offset
    })
      .then(res => { setItems(res.items); setTotal(res.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [typeFilter, offset])

  const handleUpdateFilter = (val: string) => {
    const p = new URLSearchParams(searchParams)
    if (val === 'all') p.delete('type')
    else p.set('type', val)
    p.set('offset', '0')
    setSearchParams(p)
    setSelectedIds(new Set())
  }

  const handleUpdateOffset = (val: number) => {
    const p = new URLSearchParams(searchParams)
    p.set('offset', val.toString())
    setSearchParams(p)
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map(i => i.id)))
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`Are you sure you want to delete ${ids.length} items?`)) return

    setDeleting(true)
    try {
      await deleteItemsBulk(ids)
      toast.success(`Deleted ${ids.length} items`)
      setSelectedIds(new Set())
      const res = await fetchItems({ enriched: true, type: typeFilter === 'all' ? undefined : typeFilter, limit, offset })
      setItems(res.items)
      setTotal(res.total)
    } catch (err) {
      toast.error('Failed to delete items')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="dashboard" />
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-6">
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
          </div>

          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-lg transition-all text-xs font-bold disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete Selected ({selectedIds.size})
              </button>
            )}
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto w-full flex flex-col gap-6">
          {/* Type filter pills */}
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => handleUpdateFilter(f.value)}
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

          {/* Selection control */}
          {items.length > 0 && (
            <div className="flex items-center gap-4 px-2">
              <button 
                onClick={selectAll}
                className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-ink-muted hover:text-ink transition-colors"
              >
                {selectedIds.size === items.length ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                {selectedIds.size === items.length ? 'Deselect All' : 'Select All Page'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
              <Zap size={40} className="text-ink-muted/30" />
              <p className="text-sm">No enriched notes yet. Run enrichment from Settings.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map(item => (
                  <ItemCard 
                    key={item.id} 
                    item={item} 
                    onClick={() => navigate(`/item/${item.id}`)}
                    selectable
                    selected={selectedIds.has(item.id)}
                    onToggleSelection={toggleSelect}
                  />
                ))}
              </div>

              {/* Pagination */}
              <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-between">
                <p className="text-xs text-ink-muted">
                  Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} enriched notes
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={offset === 0}
                    onClick={() => handleUpdateOffset(Math.max(0, offset - limit))}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-ink-muted hover:text-ink transition-all disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <button 
                    disabled={offset + limit >= total}
                    onClick={() => handleUpdateOffset(offset + limit)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-ink-muted hover:text-ink transition-all disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
