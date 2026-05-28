import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/sidebar/Sidebar'
import ItemCard from '../components/cards/ItemCard'
import { CardSkeleton } from '../components/Skeleton'
import { fetchItems } from '../lib/api'
import type { Item } from '../../../shared/types'

export default function PendingItemsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchItems({ pendingEnrichment: true, limit: 100 })
      .then(res => { setItems(res.items); setTotal(res.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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
            <h1 className="font-display text-lg text-ink">Pending AI Enrichment</h1>
          </div>
          {!loading && (
            <span className="text-xs text-ink-muted bg-white/5 px-2 py-1 rounded-lg">
              {total} notes waiting
            </span>
          )}
        </header>

        <div className="p-8 max-w-5xl mx-auto w-full">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
              <Zap size={40} className="text-green-400" />
              <p className="font-display text-xl text-ink">All notes are enriched!</p>
              <p className="text-sm">Ollama has classified everything in your library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map(item => (
                <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />
              ))}
              {total > 100 && (
                <p className="col-span-full text-center text-sm text-ink-muted py-4">
                  Showing first 100 of {total} pending notes. Re-run enrichment from Settings to process them.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
