import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import Sidebar from '../components/sidebar/Sidebar'
import ItemCard from '../components/cards/ItemCard'
import { fetchItems, apiFetch } from '../lib/api'
import type { Item } from '../../../shared/types'

export default function TrashPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTrash()
  }, [])

  const loadTrash = async () => {
    setLoading(true)
    try {
      const res = await fetchItems({ deleted: true } as any)
      setItems(res.items)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load trash')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await apiFetch(`/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ deleted: false }) // I need to make sure the backend handles this
      })
      setItems(items.filter(i => i.id !== id))
      toast.success('Item restored')
    } catch (err) {
      toast.error('Failed to restore item')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="trash" />

      <main className="flex-1 flex flex-col relative overflow-y-auto">
        <header className="h-16 border-b border-white/5 flex items-center gap-6 px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <Link to="/" className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex flex-col">
            <h1 className="font-display text-lg text-ink">Trash Bin</h1>
            <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">Deleted items can be restored here</p>
          </div>
        </header>

        <div className="p-12 max-w-7xl mx-auto w-full flex-1">
          {loading ? (
            <div className="flex justify-center py-20">
               <Loader2 className="animate-spin text-accent" size={32} />
            </div>
          ) : items.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
              {items.map(item => (
                <div key={item.id} className="relative group">
                   <div className="opacity-60 scale-[0.98] grayscale transition-all group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-100">
                      <ItemCard item={item} />
                   </div>
                   <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleRestore(item.id)}
                        className="p-2 bg-accent text-bg rounded-lg shadow-lg hover:scale-110 active:scale-95 transition-all"
                        title="Restore Item"
                      >
                        <RotateCcw size={16} />
                      </button>
                   </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/5 rounded-3xl gap-6 grayscale opacity-50">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-ink-muted">
                <Trash2 size={32} />
              </div>
              <div className="text-center">
                <h3 className="font-display text-xl text-ink">Trash is empty</h3>
                <p className="text-ink-muted text-sm max-w-xs mt-2">
                  When you delete items, they'll appear here for recovery.
                </p>
              </div>
            </div>
          )}

          {items.length > 0 && (
             <div className="mt-12 p-6 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-center gap-4">
                <AlertTriangle className="text-red-500 shrink-0" size={24} />
                <p className="text-sm text-ink-muted">
                   Items in the trash are excluded from search and AI analysis. Restoring an item will re-enable all features.
                </p>
             </div>
          )}
        </div>
      </main>
    </div>
  )
}
