import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Filter, SortAsc } from 'lucide-react'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import ItemCard from '../components/cards/ItemCard'
import { CardSkeleton } from '../components/Skeleton'
import { fetchItems, apiFetch } from '../lib/api'
import type { Item, Category } from '../../../shared/types'

type SortOption = 'newest' | 'oldest' | 'alpha' | 'type'

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [category, setCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [offset, setOffset] = useState(0)
  const limit = 24

  useEffect(() => {
    if (!id) return;
    
    setLoading(true)
    
    apiFetch<Category[]>(`/categories`)
      .then(allCats => {
        const findCat = (cats: Category[]): Category | null => {
          for (const c of cats) {
            if (c.id === id) return c;
            if (c.children) {
              const found = findCat(c.children);
              if (found) return found;
            }
          }
          return null;
        }
        const cat = findCat(allCats);
        setCategory(cat);
        
        if (cat) {
          return fetchItems({ category: cat.name, type: typeFilter || undefined, limit, offset })
        }
        return { items: [], total: 0 }
      })
      .then(res => {
        let sorted = [...res.items]
        if (sortBy === 'oldest') sorted.reverse()
        if (sortBy === 'alpha') sorted.sort((a, b) => a.title.localeCompare(b.title))
        if (sortBy === 'type') sorted.sort((a, b) => a.type.localeCompare(b.type))
        setItems(sorted)
        setTotal(res.total)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id, typeFilter, sortBy, offset])

  const handleUpdateFilter = (type: string | null) => {
    setTypeFilter(type)
    setOffset(0)
  }

  const handleUpdateSort = (sort: SortOption) => {
    setSortBy(sort)
    setOffset(0)
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="categories" />

      <main className="flex-1 flex flex-col relative">
        <AppHeader
          left={<div className="flex items-center gap-6"><Link to="/" className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></Link><div className="flex flex-col"><h1 className="font-display text-lg text-ink">{category ? category.name : 'Loading...'}</h1><p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">{category?.itemCount || 0} items in this category</p></div></div>}
          actions={<div className="flex items-center gap-6"><div className="flex items-center gap-2"><SortAsc size={14} className="text-ink-muted" /><select className="bg-surface border border-white/10 rounded-lg px-3 py-1 text-xs text-ink outline-none focus:border-accent/50 cursor-pointer" value={sortBy} onChange={(e) => handleUpdateSort(e.target.value as SortOption)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="alpha">Alphabetical</option><option value="type">By Type</option></select></div><div className="flex items-center gap-2"><Filter size={14} className="text-ink-muted" /><select className="bg-surface border border-white/10 rounded-lg px-3 py-1 text-xs text-ink outline-none focus:border-accent/50 cursor-pointer" value={typeFilter || ''} onChange={(e) => handleUpdateFilter(e.target.value || null)}><option value="">All Types</option><option value="note">Notes</option><option value="recipe">Recipes</option><option value="media">Media</option><option value="link">Links</option><option value="book">Books</option><option value="stock">Stocks</option><option value="spec">Specs</option></select></div></div>}
        />
        <AppHeader.Spacer />

        <div className="p-12 max-w-7xl mx-auto w-full flex-1 flex flex-col">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
               {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500 flex-1">
                {items.map(item => (
                  <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />
                ))}
              </div>
              
              {/* Pagination */}
              <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-between">
                <p className="text-xs text-ink-muted">
                  Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} items
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-ink-muted hover:text-ink transition-all disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <button 
                    disabled={offset + limit >= total}
                    onClick={() => setOffset(offset + limit)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-ink-muted hover:text-ink transition-all disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/5 rounded-3xl gap-6 grayscale opacity-50">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-ink-muted">
                <Filter size={32} />
              </div>
              <div className="text-center">
                <h3 className="font-display text-xl text-ink">No items found</h3>
                <p className="text-ink-muted text-sm max-w-xs mt-2">
                  There are no items matching your criteria in this category.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
