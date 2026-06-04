import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2, Check, Filter, Search, RotateCcw, Shield, Download, Bell, Sparkles, X, Send, Trash2, Pencil } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import { fetchItems, updateItem, migrateToVault, nlFilter, deleteItem } from '../lib/api'
import { useVaultStore } from '../store/vaultStore'
import { encryptVaultItem } from '../lib/crypto'
import { itemsToCsv, downloadCsv } from '../lib/export'
import type { Item, ItemType, ParsedFilter } from '../../../shared/types'

const TYPE_OPTIONS: { label: string; value: ItemType | 'all' }[] = [
  { label: 'All Types', value: 'all' },
  { label: 'Notes', value: 'note' },
  { label: 'Recipes', value: 'recipe' },
  { label: 'Media', value: 'media' },
  { label: 'Books', value: 'book' },
  { label: 'Links', value: 'link' },
  { label: 'Stocks', value: 'stock' },
  { label: 'Specs', value: 'spec' },
]

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Pending Review', value: 'unreviewed' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Pending AI', value: 'pendingEnrichment' },
  { label: 'AI Enriched', value: 'enriched' },
]

export default function TableView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [bulkReviewing, setBulkReviewing] = useState(false)
  const [migratingId, setMigratingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { vaultKey, isLocked } = useVaultStore()

  // NL filter mode
  const [nlMode, setNlMode] = useState(false)
  const [nlQuery, setNlQuery] = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [parsedFilter, setParsedFilter] = useState<ParsedFilter | null>(null)

  // Filters from URL
  const type = (searchParams.get('type') as ItemType | 'all') || 'all'
  const status = searchParams.get('status') || 'all'
  const q = searchParams.get('q') || ''
  const hasReminder = searchParams.get('hasReminder') === 'true'
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const limit = 50

  useEffect(() => {
    setLoading(true)
    fetchItems({
      type: type === 'all' ? undefined : type,
      unreviewed: status === 'unreviewed' ? true : undefined,
      pendingEnrichment: status === 'pendingEnrichment' ? true : undefined,
      enriched: status === 'enriched' ? true : undefined,
      hasReminder: hasReminder || undefined,
      q: q || undefined,
      limit,
      offset,
    })
      .then(res => {
        setItems(res.items)
        setTotal(res.total)
      })
      .catch(err => {
        console.error(err)
        toast.error('Failed to load items')
      })
      .finally(() => setLoading(false))
  }, [type, status, q, hasReminder, offset])

  const handleUpdateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value === 'all' || !value) {
      newParams.delete(key)
    } else {
      newParams.set(key, value)
    }
    newParams.set('offset', '0') // Reset pagination
    setSearchParams(newParams)
  }

  const handleReview = async (id: string) => {
    try {
      await updateItem(id, { reviewed: true })
      setItems(prev => prev.map(item => item.id === id ? { ...item, reviewed: true } : item))
      toast.success('Item reviewed')
    } catch (err) {
      toast.error('Failed to review item')
    }
  }

  const handleBulkReview = async () => {
    if (!confirm('Mark all AI-enriched Keep notes as reviewed?')) return
    
    setBulkReviewing(true)
    try {
      const res = await fetch('/api/items/review-all', { method: 'PUT' })
      const data = await res.json()
      toast.success(`Marked ${data.count} items as reviewed`)
      // Refresh current view
      const fresh = await fetchItems({ type, limit, offset, q: q || undefined })
      setItems(fresh.items)
    } catch (err) {
      toast.error('Bulk review failed')
    } finally {
      setBulkReviewing(false)
    }
  }

  const handleMoveToVault = async (item: Item) => {
    if (isLocked || !vaultKey) {
      toast.error('Vault is locked. Unlock it from the Vault page first.')
      navigate('/vault')
      return
    }

    if (!confirm(`Move "${item.title}" to secure vault?`)) return

    setMigratingId(item.id)
    try {
      const { ciphertext, iv } = await encryptVaultItem(item.content, vaultKey)
      await migrateToVault(item.id, {
        service: item.title,
        url: item.sourceUrl || undefined,
        ciphertext,
        iv
      })
      toast.success('Item moved to secure vault')
      setItems(prev => prev.filter(i => i.id !== item.id))
      setTotal(prev => prev - 1)
    } catch (err) {
      console.error(err)
      toast.error('Failed to move item to vault')
    } finally {
      setMigratingId(null)
    }
  }

  const handleDelete = async (item: Item) => {
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

  const handleExportCsv = () => {
    if (items.length === 0) return
    const csv = itemsToCsv(items)
    downloadCsv(csv, `memex-export-${new Date().toISOString().split('T')[0]}.csv`)
    toast.success('CSV exported')
  }

  const handleNLFilter = async () => {
    if (!nlQuery.trim() || nlLoading) return
    setNlLoading(true)
    setParsedFilter(null)
    try {
      const result = await nlFilter(nlQuery.trim())
      setItems(result.items)
      setTotal(result.total)
      setParsedFilter(result.parsedFilter)
    } catch (err) {
      toast.error('Natural language filter failed')
      console.error(err)
    } finally {
      setNlLoading(false)
    }
  }

  const clearNLMode = () => {
    setNlMode(false)
    setNlQuery('')
    setParsedFilter(null)
    // Re-run normal filter
    setLoading(true)
    fetchItems({
      type: type === 'all' ? undefined : type,
      unreviewed: status === 'unreviewed' ? true : undefined,
      pendingEnrichment: status === 'pendingEnrichment' ? true : undefined,
      enriched: status === 'enriched' ? true : undefined,
      hasReminder: hasReminder || undefined,
      q: q || undefined,
      limit,
      offset,
    })
      .then(res => { setItems(res.items); setTotal(res.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  return (
    <div className="min-h-screen bg-bg flex text-ink">
      <Sidebar activeSection="dashboard" />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader
          left={<div className="flex items-center gap-6"><button onClick={() => navigate('/')} className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></button><h1 className="font-display text-lg">All Items Table</h1>{!loading && <span className="text-xs text-ink-muted bg-white/5 px-2 py-1 rounded-lg">{total} items</span>}</div>}
          actions={<div className="flex items-center gap-3"><button onClick={handleExportCsv} className="text-xs flex items-center gap-2 bg-white/5 text-ink-muted hover:text-ink border border-white/10 px-3 py-1.5 rounded-lg transition-all"><Download size={14} />Export CSV</button><button onClick={handleBulkReview} disabled={bulkReviewing} className="text-xs flex items-center gap-2 bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">{bulkReviewing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Mark All Reviewed</button></div>}
        />
        <AppHeader.Spacer />

        <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
          {/* Filters Bar */}
          <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
            {nlMode ? (
              /* NL filter input */
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Sparkles size={16} className="text-purple-400 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder={'e.g. "Thai restaurants I haven\'t visited" or "movies I want to watch"'}
                  value={nlQuery}
                  onChange={e => setNlQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNLFilter()}
                  className="bg-transparent border-none outline-none text-sm w-full placeholder:text-ink-muted/40 text-purple-100"
                />
                <button
                  onClick={handleNLFilter}
                  disabled={nlLoading || !nlQuery.trim()}
                  className="shrink-0 p-1.5 text-purple-400 hover:text-purple-300 disabled:opacity-30 transition-colors"
                >
                  {nlLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
                <button onClick={clearNLMode} className="shrink-0 p-1.5 text-ink-muted hover:text-ink transition-colors">
                  <X size={16} />
                </button>
              </div>
            ) : (
              /* Normal search */
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search size={16} className="text-ink-muted" />
                <input
                  type="text"
                  placeholder="Search title or content..."
                  value={q}
                  onChange={(e) => handleUpdateFilter('q', e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full placeholder:text-ink-muted/50"
                />
              </div>
            )}

            <div className="h-4 w-px bg-white/10 mx-2 hidden sm:block" />

            <div className="flex items-center gap-3">
              <Filter size={16} className="text-ink-muted" />
              <select 
                value={type} 
                onChange={(e) => handleUpdateFilter('type', e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent/50 transition-colors"
              >
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <select 
                value={status} 
                onChange={(e) => handleUpdateFilter('status', e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent/50 transition-colors"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <button
                onClick={() => {
                  const p = new URLSearchParams(searchParams)
                  if (hasReminder) p.delete('hasReminder')
                  else p.set('hasReminder', 'true')
                  p.set('offset', '0')
                  setSearchParams(p)
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  hasReminder
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-white/5 text-ink-muted border border-white/10 hover:text-ink'
                }`}
                title="Filter items with reminders"
              >
                <Bell size={13} />
                Has Reminder
              </button>

              <button
                onClick={() => { if (nlMode) clearNLMode(); else setNlMode(true) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  nlMode
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-white/5 text-ink-muted border border-white/10 hover:text-ink'
                }`}
                title="Ask a natural language filter"
              >
                <Sparkles size={13} />
                Ask AI
              </button>

              <button
                onClick={() => { clearNLMode(); setSearchParams({}) }}
                className="p-1.5 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-colors"
                title="Reset Filters"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          {/* Parsed filter interpretation badge */}
          {parsedFilter && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">Interpreted as:</span>
              {parsedFilter.type && (
                <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  type: {parsedFilter.type}
                </span>
              )}
              {parsedFilter.searchQuery && (
                <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  search: "{parsedFilter.searchQuery}"
                </span>
              )}
              {Object.entries(parsedFilter.structuredFilters).map(([k, v]) => (
                <span key={k} className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  {k}: {v}
                </span>
              ))}
              <span className="text-[10px] text-ink-muted">{total} result{total !== 1 ? 's' : ''}</span>
            </div>
          )}
          </div>

          {/* Table Container */}
          <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden flex flex-col">
            <div className="overflow-x-auto overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="sticky top-0 bg-bg/95 backdrop-blur-sm shadow-sm z-10">
                  <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-ink-muted font-semibold">
                    <th className="px-6 py-4 w-[25%] min-w-[200px]">Title</th>
                    <th className="px-4 py-4 w-24">Type</th>
                    <th className="px-4 py-4 w-40">Categories</th>
                    <th className="px-4 py-4 w-40">Tags</th>
                    <th className="px-4 py-4 w-24 text-center">Score</th>
                    <th className="px-4 py-4 min-w-[300px]">Summary</th>
                    <th className="px-6 py-4 w-36 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loading ? (
                    [...Array(10)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-6 py-4"><div className="h-4 bg-white/5 rounded w-3/4" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-16" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-24" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-20" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-12 mx-auto" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-full" /></td>
                        <td className="px-6 py-4"><div className="h-8 bg-white/5 rounded w-16 mx-auto" /></td>
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-24 text-center text-ink-muted text-sm">
                        No items found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    items.map(item => (
                      <tr key={item.id} className="hover:bg-white/[0.03] transition-colors group">
                        <td className="px-6 py-4 truncate font-medium text-ink/90 group-hover:text-ink cursor-pointer" onClick={() => navigate(`/item/${item.id}`)}>
                          <div className="flex items-center gap-2">
                            {item.remindAt && (
                              <span title={`Reminder: ${new Date(item.remindAt).toLocaleString()}`}>
                                <Bell size={11} className="text-accent shrink-0" />
                              </span>
                            )}
                            {item.title}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase font-bold text-ink-muted">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-4 py-4 truncate text-xs text-ink-muted" title={item.categories.join(' > ')}>
                          {item.categories.join(' > ') || '—'}
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
                          {item.confidence !== undefined && item.confidence !== null ? (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                              item.confidence >= 90 ? 'bg-green-500/10 text-green-400' :
                              item.confidence >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                              'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              {item.confidence}%
                            </span>
                          ) : (
                            <span className="text-ink-muted/30 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-ink-muted line-clamp-1 h-12 flex items-center">
                          {(item.structured as any)?.summary || '—'}
                        </td>
                        <td className="px-6 py-4 flex justify-center items-center gap-1.5">
                          <button
                            onClick={() => navigate(`/item/${item.id}`)}
                            className="p-1.5 text-ink-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleMoveToVault(item)}
                            disabled={migratingId === item.id}
                            className="p-1.5 text-ink-muted hover:text-green-400 hover:bg-green-400/10 rounded-lg transition-all"
                            title="Move to Secure Vault"
                          >
                            {migratingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
                          </button>
                          {!item.reviewed && (
                            <button
                              onClick={() => handleReview(item.id)}
                              className="p-1.5 text-accent/60 hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                              title="Mark Reviewed"
                            >
                              <Check size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.id}
                            className="p-1.5 text-ink-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                            title="Delete"
                          >
                            {deletingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="h-14 border-t border-white/5 flex items-center justify-between px-8 bg-white/[0.01]">
              <div className="text-xs text-ink-muted">
                Showing {items.length > 0 ? offset + 1 : 0} to {offset + items.length} of {total} items
              </div>
              <div className="flex items-center gap-2">
                <button 
                  disabled={offset === 0}
                  onClick={() => handleUpdateFilter('offset', (offset - limit).toString())}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  Previous
                </button>
                <button 
                  disabled={offset + limit >= total}
                  onClick={() => handleUpdateFilter('offset', (offset + limit).toString())}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
