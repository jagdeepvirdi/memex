import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Loader2, Zap, Trash2, Square, CheckSquare, LayoutGrid, List, Pencil, FolderPen, X, Check } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import ItemCard from '../components/cards/ItemCard'
import { CardSkeleton } from '../components/Skeleton'
import { fetchItems, deleteItemsBulk, deleteItem, updateItem } from '../lib/api'
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

type ViewMode = 'card' | 'table'

export default function EnrichedItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [recatItem, setRecatItem] = useState<Item | null>(null)
  const [recatValue, setRecatValue] = useState('')
  const [recatSaving, setRecatSaving] = useState(false)
  const recatInputRef = useRef<HTMLInputElement>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('enriched-view-mode') as ViewMode | null) ?? 'card'
  )

  const typeFilter = (searchParams.get('type') as ItemType | 'all') || 'all'
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const limit = viewMode === 'table' ? 50 : 48

  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    fetchItems({
      enriched: true,
      type: typeFilter === 'all' ? undefined : typeFilter,
      limit,
      offset
    })
      .then(res => { setItems(res.items); setTotal(res.total) })
      .catch(err => {
        console.error(err)
        setFetchError('Failed to load items. Please try again.')
        setItems([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [typeFilter, offset, viewMode])

  const switchView = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('enriched-view-mode', mode)
    setSelectedIds(new Set())
  }

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
    if (!confirm(`Delete ${ids.length} item${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return

    setDeleting(true)
    try {
      await deleteItemsBulk(ids)
      toast.success(`Deleted ${ids.length} item${ids.length > 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      const res = await fetchItems({ enriched: true, type: typeFilter === 'all' ? undefined : typeFilter, limit, offset })
      setItems(res.items)
      setTotal(res.total)
    } catch {
      toast.error('Failed to delete items')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteItem = async (item: Item) => {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    setDeletingId(item.id)
    try {
      await deleteItem(item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      setTotal(prev => prev - 1)
      toast.success('Item deleted')
    } catch {
      toast.error('Failed to delete item')
    } finally {
      setDeletingId(null)
    }
  }

  const openRecat = (item: Item) => {
    setRecatItem(item)
    setRecatValue(item.categories.join(' > '))
    setTimeout(() => recatInputRef.current?.focus(), 50)
  }

  const handleRecat = async () => {
    if (!recatItem) return
    const categories = recatValue.split(/[>\/,]/).map(s => s.trim()).filter(Boolean)
    if (categories.length === 0) return
    setRecatSaving(true)
    try {
      const updated = await updateItem(recatItem.id, { categories })
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
      toast.success('Category updated')
      setRecatItem(null)
    } catch {
      toast.error('Failed to update category')
    } finally {
      setRecatSaving(false)
    }
  }

  const pageLimit = viewMode === 'table' ? 50 : 48

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="dashboard" />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader
          left={<div className="flex items-center gap-6"><button onClick={() => navigate('/')} className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></button><div className="flex items-center gap-3"><Zap size={20} className="text-yellow-400" /><h1 className="font-display text-lg text-ink">AI Enriched Notes</h1></div>{!loading && <span className="text-xs text-ink-muted bg-white/5 px-2 py-1 rounded-lg">{total} enriched</span>}</div>}
          actions={<div className="flex items-center gap-3">{selectedIds.size > 0 && <button onClick={handleBulkDelete} disabled={deleting} className="flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-lg transition-all text-xs font-bold disabled:opacity-50">{deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Delete Selected ({selectedIds.size})</button>}<div className="flex bg-white/5 border border-white/10 p-0.5 rounded-lg"><button onClick={() => switchView('card')} className={`p-1.5 rounded-md transition-all ${viewMode === 'card' ? 'bg-accent text-bg' : 'text-ink-muted hover:text-ink'}`} title="Card view"><LayoutGrid size={15} /></button><button onClick={() => switchView('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-accent text-bg' : 'text-ink-muted hover:text-ink'}`} title="Table view"><List size={15} /></button></div></div>}
        />
        <AppHeader.Spacer />

        <div className={`p-8 w-full flex flex-col gap-6 ${viewMode === 'card' ? 'max-w-7xl mx-auto' : ''}`}>
          {/* Error banner */}
          {fetchError && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              <span>{fetchError}</span>
              <button
                onClick={() => window.location.reload()}
                className="ml-auto text-xs underline hover:no-underline"
              >
                Reload
              </button>
            </div>
          )}

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
              {selectedIds.size > 0 && (
                <span className="text-[10px] text-ink-muted">{selectedIds.size} selected</span>
              )}
            </div>
          )}

          {/* ── Card view ── */}
          {viewMode === 'card' && (
            loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
                <Zap size={40} className="text-ink-muted/30" />
                <p className="text-sm">No enriched notes yet. Run enrichment from Settings.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map(item => (
                  <div key={item.id} className="relative group/wrap">
                    <ItemCard
                      item={item}
                      onClick={() => navigate(`/item/${item.id}`)}
                      selectable
                      selected={selectedIds.has(item.id)}
                      onToggleSelection={toggleSelect}
                    />
                    {/* Per-card action buttons (visible on hover) */}
                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/wrap:opacity-100 transition-opacity z-20">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/item/${item.id}`) }}
                        className="p-1.5 bg-surface/90 border border-white/10 text-ink-muted hover:text-accent hover:border-accent/40 rounded-lg transition-all backdrop-blur-sm"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openRecat(item) }}
                        className="p-1.5 bg-surface/90 border border-white/10 text-ink-muted hover:text-yellow-400 hover:border-yellow-400/40 rounded-lg transition-all backdrop-blur-sm"
                        title="Change category"
                      >
                        <FolderPen size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteItem(item) }}
                        disabled={deletingId === item.id}
                        className="p-1.5 bg-surface/90 border border-white/10 text-ink-muted hover:text-red-400 hover:border-red-400/40 rounded-lg transition-all backdrop-blur-sm disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Table view ── */}
          {viewMode === 'table' && (
            <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden flex flex-col">
              <div className="overflow-x-auto overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="sticky top-0 bg-bg/95 backdrop-blur-sm shadow-sm z-10">
                    <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-ink-muted font-semibold">
                      <th className="px-4 py-4 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === items.length && items.length > 0}
                          onChange={selectAll}
                          className="w-3.5 h-3.5 rounded bg-surface border-white/20 accent-accent cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-4 w-[28%] min-w-[180px]">Title</th>
                      <th className="px-4 py-4 w-20">Type</th>
                      <th className="px-4 py-4 w-40">Categories</th>
                      <th className="px-4 py-4 w-32">Tags</th>
                      <th className="px-4 py-4 w-20 text-center">Score</th>
                      <th className="px-4 py-4 min-w-[200px]">Summary</th>
                      <th className="px-4 py-4 w-24 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {loading ? (
                      [...Array(10)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-4 py-4"><div className="h-3.5 w-3.5 bg-white/5 rounded" /></td>
                          <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-3/4" /></td>
                          <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-12" /></td>
                          <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-24" /></td>
                          <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-16" /></td>
                          <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-10 mx-auto" /></td>
                          <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-full" /></td>
                          <td className="px-4 py-4"><div className="h-8 bg-white/5 rounded w-16 mx-auto" /></td>
                        </tr>
                      ))
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-24 text-center text-ink-muted text-sm">
                          No enriched notes found for this filter.
                        </td>
                      </tr>
                    ) : (
                      items.map(item => (
                        <tr
                          key={item.id}
                          className={`hover:bg-white/[0.03] transition-colors group ${selectedIds.has(item.id) ? 'bg-accent/[0.04]' : ''}`}
                        >
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelect(item.id)}
                              className="w-3.5 h-3.5 rounded bg-surface border-white/20 accent-accent cursor-pointer"
                            />
                          </td>
                          <td
                            className="px-4 py-4 font-medium text-ink/90 group-hover:text-ink cursor-pointer truncate"
                            onClick={() => navigate(`/item/${item.id}`)}
                          >
                            {item.title}
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase font-bold text-ink-muted">
                              {item.type}
                            </span>
                          </td>
                          <td className="px-4 py-4 truncate text-xs text-ink-muted" title={item.categories.join(' > ')}>
                            {item.categories[item.categories.length - 1] || '—'}
                          </td>
                          <td className="px-4 py-4 truncate">
                            <div className="flex gap-1 overflow-hidden">
                              {item.tags.slice(0, 2).map(t => (
                                <span key={t} className="text-[10px] text-accent/70">#{t}</span>
                              ))}
                              {item.tags.length > 2 && <span className="text-[10px] text-ink-muted">+{item.tags.length - 2}</span>}
                              {item.tags.length === 0 && <span className="text-ink-muted/30">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.confidence != null ? (
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                item.confidence >= 90 ? 'bg-green-500/10 text-green-400' :
                                item.confidence >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                                'bg-red-500/10 text-red-400'
                              }`}>
                                {item.confidence}%
                              </span>
                            ) : (
                              <span className="text-ink-muted/30 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-xs text-ink-muted truncate">
                            {(item.structured as any)?.summary || item.content.slice(0, 120) || '—'}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-center items-center gap-1.5">
                              <button
                                onClick={() => navigate(`/item/${item.id}`)}
                                className="p-1.5 text-ink-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => openRecat(item)}
                                className="p-1.5 text-ink-muted hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all"
                                title="Change category"
                              >
                                <FolderPen size={15} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item)}
                                disabled={deletingId === item.id}
                                className="p-1.5 text-ink-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all disabled:opacity-50"
                                title="Delete"
                              >
                                {deletingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table pagination */}
              <div className="h-14 border-t border-white/5 flex items-center justify-between px-8 bg-white/[0.01]">
                <div className="text-xs text-ink-muted">
                  Showing {items.length > 0 ? offset + 1 : 0} to {offset + items.length} of {total} enriched notes
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={offset === 0}
                    onClick={() => handleUpdateOffset(Math.max(0, offset - pageLimit))}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:bg-white/5 disabled:opacity-30 transition-all"
                  >
                    Previous
                  </button>
                  <button
                    disabled={offset + pageLimit >= total}
                    onClick={() => handleUpdateOffset(offset + pageLimit)}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:bg-white/5 disabled:opacity-30 transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Card view pagination */}
          {viewMode === 'card' && !loading && items.length > 0 && (
            <div className="mt-4 pt-8 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-ink-muted">
                Showing {offset + 1} to {Math.min(offset + pageLimit, total)} of {total} enriched notes
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => handleUpdateOffset(Math.max(0, offset - pageLimit))}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-ink-muted hover:text-ink transition-all disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={offset + pageLimit >= total}
                  onClick={() => handleUpdateOffset(offset + pageLimit)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-ink-muted hover:text-ink transition-all disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Quick recategorize modal */}
      {recatItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <FolderPen size={16} className="text-accent" />
                <h2 className="font-display text-base text-ink">Change Category</h2>
              </div>
              <button onClick={() => setRecatItem(null)} className="p-1.5 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-ink-muted truncate">
                <span className="text-ink font-medium">{recatItem.title}</span>
              </p>
              <div>
                <label className="text-[10px] text-ink-muted uppercase tracking-widest font-bold block mb-2">
                  Category path
                </label>
                <input
                  ref={recatInputRef}
                  value={recatValue}
                  onChange={e => setRecatValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRecat(); if (e.key === 'Escape') setRecatItem(null) }}
                  placeholder="Personal > Notes  (separate with  >  or  ,)"
                  className="w-full bg-bg border border-white/10 rounded-lg py-2.5 px-3 text-sm text-ink focus:border-accent outline-none transition-all placeholder:text-ink-muted/40"
                />
                <p className="text-[10px] text-ink-muted/50 mt-1.5">
                  Current: <span className="text-ink-muted">{recatItem.categories.join(' › ') || '—'}</span>
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setRecatItem(null)}
                  className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-ink-muted hover:text-ink hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecat}
                  disabled={recatSaving || !recatValue.trim()}
                  className="flex-1 py-2 rounded-lg bg-accent text-bg font-bold text-sm hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {recatSaving ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Save</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
