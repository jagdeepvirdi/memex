import { useState, useEffect } from 'react'
import { ArrowLeft, Star, Book, ExternalLink, Search, RotateCcw, Clapperboard, Download } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import { fetchItems, updateItem } from '../lib/api'
import { itemsToCsv, downloadCsv } from '../lib/export'
import type { Item } from '../../../shared/types'

export default function MediaView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const mode = searchParams.get('mode') || 'media' // 'media' (movies) or 'book'
  const q = searchParams.get('q') || ''
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const limit = 50

  useEffect(() => {
    setLoading(true)
    fetchItems({
      type: mode as any,
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
        toast.error(`Failed to load ${mode === 'book' ? 'books' : 'media'}`)
      })
      .finally(() => setLoading(false))
  }, [mode, q, offset])

  const handleUpdateRating = async (id: string, rating: number) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const structured = { ...item.structured, userRating: rating }
    try {
      await updateItem(id, { structured })
      setItems(prev => prev.map(i => i.id === id ? { ...i, structured } : i))
    } catch (err) {
      toast.error('Failed to update rating')
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const structured = mode === 'book' 
      ? { ...item.structured, status } 
      : { ...item.structured, watchStatus: status }
    
    try {
      await updateItem(id, { structured })
      setItems(prev => prev.map(i => i.id === id ? { ...i, structured } : i))
    } catch (err) {
      toast.error('Failed to update status')
    }
  }

  const handleExportCsv = () => {
    if (items.length === 0) return
    const csv = itemsToCsv(items)
    const filename = mode === 'book' ? 'memex-library' : 'memex-media'
    downloadCsv(csv, `${filename}-${new Date().toISOString().split('T')[0]}.csv`)
    toast.success('CSV exported')
  }

  return (
    <div className="min-h-screen bg-bg flex text-ink">
      <Sidebar activeSection="media" />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader
          left={<div className="flex items-center gap-6"><button onClick={() => navigate('/')} className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></button><h1 className="font-display text-lg flex items-center gap-2">{mode === 'book' ? <Book size={20} className="text-accent" /> : <Clapperboard size={20} className="text-accent" />}{mode === 'book' ? 'Library (Books)' : 'Media & Movies'}</h1><div className="flex bg-white/5 p-1 rounded-lg"><button onClick={() => { const p = new URLSearchParams(searchParams); p.set('mode', 'media'); setSearchParams(p) }} className={`px-3 py-1 text-[10px] rounded-md transition-all ${mode === 'media' ? 'bg-accent text-bg font-bold' : 'text-ink-muted hover:text-ink'}`}>Movies</button><button onClick={() => { const p = new URLSearchParams(searchParams); p.set('mode', 'book'); setSearchParams(p) }} className={`px-3 py-1 text-[10px] rounded-md transition-all ${mode === 'book' ? 'bg-accent text-bg font-bold' : 'text-ink-muted hover:text-ink'}`}>Books</button></div>{!loading && <span className="text-xs text-ink-muted bg-white/5 px-2 py-1 rounded-lg">{total} items</span>}</div>}
          actions={<button onClick={handleExportCsv} className="text-xs flex items-center gap-2 bg-white/5 text-ink-muted hover:text-ink border border-white/10 px-3 py-1.5 rounded-lg transition-all"><Download size={14} />Export CSV</button>}
        />
        <AppHeader.Spacer />

        <div className="p-8 flex-1 flex flex-col gap-6 overflow-hidden">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search size={16} className="text-ink-muted" />
              <input 
                type="text" 
                placeholder={`Search ${mode === 'book' ? 'authors, titles...' : 'movies, directors...'}`}
                value={q}
                onChange={(e) => {
                   const p = new URLSearchParams(searchParams)
                   p.set('q', e.target.value)
                   setSearchParams(p)
                }}
                className="bg-transparent border-none outline-none text-sm w-full placeholder:text-ink-muted/50"
              />
            </div>
            
            <button 
              onClick={() => setSearchParams({ mode })}
              className="p-1.5 text-ink-muted hover:text-ink hover:bg-white/5 rounded-lg transition-colors"
              title="Reset Filters"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {/* Table Container */}
          <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden flex flex-col">
            <div className="overflow-x-auto overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="sticky top-0 bg-bg/95 backdrop-blur-sm shadow-sm z-10">
                  <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-ink-muted font-semibold">
                    <th className="px-6 py-4 w-[25%] min-w-[200px]">Title</th>
                    <th className="px-4 py-4 w-32">{mode === 'book' ? 'Author' : 'Director'}</th>
                    <th className="px-4 py-4 w-40">Genre</th>
                    <th className="px-4 py-4 w-40">Status</th>
                    <th className="px-4 py-4 w-32">Rating</th>
                    <th className="px-6 py-4 w-16 text-center"></th>
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
                        <td className="px-4 py-4"><div className="h-4 bg-white/5 rounded w-full" /></td>
                        <td className="px-6 py-4"><div className="h-8 bg-white/5 rounded w-16 mx-auto" /></td>
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-24 text-center text-ink-muted text-sm">
                        No {mode === 'book' ? 'books' : 'media'} found.
                      </td>
                    </tr>
                  ) : (
                    items.map(item => {
                      const data = item.structured as any
                      const status = mode === 'book' ? data.status : data.watchStatus
                      return (
                        <tr key={item.id} className="hover:bg-white/[0.03] transition-colors group">
                          <td className="px-6 py-4 truncate font-medium text-ink/90 group-hover:text-ink cursor-pointer" onClick={() => navigate(`/item/${item.id}`)}>
                            {item.title}
                            {data.year && <span className="ml-2 text-[10px] text-ink-muted font-normal">({data.year})</span>}
                          </td>
                          <td className="px-4 py-4 truncate text-xs text-ink-muted">
                            {(mode === 'book' ? data.author : data.director) || '—'}
                          </td>
                          <td className="px-4 py-4 truncate text-xs text-ink-muted">
                            {data.genre || '—'}
                          </td>
                          <td className="px-4 py-4">
                            <select 
                              value={status || ''} 
                              onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                              className="bg-transparent border-none text-xs text-ink-muted focus:text-accent outline-none cursor-pointer"
                            >
                              <option value="">Unknown</option>
                              {mode === 'book' ? (
                                <>
                                  <option value="want-to-read">Want to Read</option>
                                  <option value="reading">Reading</option>
                                  <option value="read">Read</option>
                                </>
                              ) : (
                                <>
                                  <option value="want-to-watch">Want to Watch</option>
                                  <option value="watching">Watching</option>
                                  <option value="watched">Watched</option>
                                </>
                              )}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button 
                                  key={star} 
                                  onClick={() => handleUpdateRating(item.id, star)}
                                  className={`transition-colors ${star <= (data.userRating || 0) ? 'text-accent' : 'text-white/10 hover:text-accent/40'}`}
                                >
                                  <Star size={12} fill={star <= (data.userRating || 0) ? 'currentColor' : 'none'} />
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 flex justify-center items-center gap-2">
                            <button 
                              onClick={() => navigate(`/item/${item.id}`)}
                              className="p-1.5 text-ink-muted hover:text-ink hover:bg-white/10 rounded-lg transition-all"
                              title="View Details"
                            >
                              <ExternalLink size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })
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
                  onClick={() => {
                     const p = new URLSearchParams(searchParams)
                     p.set('offset', (offset - limit).toString())
                     setSearchParams(p)
                  }}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  Previous
                </button>
                <button 
                  disabled={offset + limit >= total}
                  onClick={() => {
                     const p = new URLSearchParams(searchParams)
                     p.set('offset', (offset + limit).toString())
                     setSearchParams(p)
                  }}
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
