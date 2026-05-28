import { useState, useEffect } from 'react'
import { Plus, Search, Settings, Loader2, Zap, Database, Key, Clock, HelpCircle, X, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import IngestPanel from '../components/ingest/IngestPanel'
import SearchModal from '../components/search/SearchModal'
import Sidebar from '../components/sidebar/Sidebar'
import ItemCard from '../components/cards/ItemCard'
import { CardSkeleton } from '../components/Skeleton'
import { fetchItems, fetchStats } from '../lib/api'
import type { Item, StatsResponse } from '../../../shared/types'

export default function Dashboard() {
  const [showIngest, setShowIngest] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [itemsRes, statsRes] = await Promise.all([
        fetchItems({ limit: 12 }),
        fetchStats()
      ])
      setItems(itemsRes.items)
      setStats(statsRes)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        setShowIngest(true)
        setShowSearch(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
        setShowIngest(false)
      }
      if (e.key === '?' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        setShowShortcuts(prev => !prev)
      }
      if (e.key === 'Escape') {
        setShowIngest(false)
        setShowSearch(false)
        setShowShortcuts(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="dashboard" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-bg/80 backdrop-blur-md sticky top-0 z-10">
          <div 
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-4 bg-surface/80 px-4 py-2 rounded-full border border-white/5 w-96 max-w-full cursor-pointer hover:border-accent/30 transition-all group"
          >
            <Search size={18} className="text-ink-muted group-hover:text-accent transition-colors" />
            <span className="text-ink-muted/50 text-sm flex-1">Search everything...</span>
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 rounded border border-white/5 text-[10px] text-ink-muted font-mono">
               <span className="text-[8px]">⌘</span>K
            </div>
          </div>

          <div className="flex items-center gap-4 text-ink-muted">
            <button 
              onClick={() => setShowShortcuts(true)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Keyboard Shortcuts"
            >
              <HelpCircle size={20} />
            </button>
            <Settings size={20} className="hover:text-ink cursor-pointer transition-colors" />
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent font-bold text-xs">
              M
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <div className="p-12 max-w-7xl mx-auto w-full flex flex-col gap-12">
          <section className="flex flex-col gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-2">
                <h2 className="font-display text-4xl text-ink">Welcome back</h2>
                <p className="text-ink-muted max-w-lg">
                  Memex is your personal knowledge OS. Everything you save is classified and organized by local AI.
                </p>
              </div>
              
              <button 
                onClick={() => navigate('/graph')}
                className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 px-6 py-3 rounded-2xl flex items-center gap-3 transition-all group"
              >
                 <Sparkles className="group-hover:rotate-12 transition-transform" size={20} />
                 <span className="font-bold text-sm">Open Intelligence Map</span>
              </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
               <StatCard 
                 icon={<Database size={18} className="text-blue-400" />} 
                 label="Total Items" 
                 value={stats?.totalItems ?? 0} 
               />
               <StatCard
                 icon={<Zap size={18} className="text-yellow-400" />}
                 label="AI Enriched"
                 value={stats?.aiEnriched ?? 0}
                 sub={stats && stats.pendingAI > 0 ? `${stats.pendingAI} pending` : undefined}
                 onClick={() => navigate('/items/enriched')}
                 onSubClick={stats && stats.pendingAI > 0 ? () => navigate('/items/pending') : undefined}
               />
               <StatCard 
                 icon={<Key size={18} className="text-teal-400" />} 
                 label="Secrets in Vault" 
                 value={stats?.totalVaultItems ?? 0} 
               />
               <StatCard 
                 icon={<Clock size={18} className="text-purple-400" />} 
                 label="Last 24h Activity" 
                 value={stats?.recentActivity ?? 0} 
               />
            </div>
          </section>

          {/* Recent Items */}
          <section className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-ink">Recent Additions</h3>
              <button onClick={() => setShowSearch(true)} className="text-xs text-accent hover:underline font-medium">View All Items</button>
            </div>
            
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map(item => (
                  <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />
                ))}
              </div>
            ) : (
              <div className="h-48 rounded-2xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center text-ink-muted gap-3 grayscale opacity-50">
                <p className="text-sm italic">No items yet. Add something below!</p>
                <button 
                  onClick={() => setShowIngest(true)}
                  className="text-xs bg-white/5 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
                >
                  Quick Add
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Overlays */}
        {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
        
        {showIngest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
              <IngestPanel 
                onSuccess={(newItem) => {
                  setItems([newItem, ...items].slice(0, 12))
                  setShowIngest(false)
                  fetchStats().then(setStats).catch(console.error)
                }} 
                onCancel={() => setShowIngest(false)} 
              />
            </div>
          </div>
        )}

        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

        {/* Floating Action Button */}
        <button 
          onClick={() => setShowIngest(true)}
          className="fixed bottom-8 right-8 w-14 h-14 bg-accent hover:bg-accent-dark text-bg rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-40 group"
          title="Add to Memex"
        >
          <Plus size={28} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, sub, onClick, onSubClick }: { icon: React.ReactNode, label: string, value: number | string, sub?: string, onClick?: () => void, onSubClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface/50 border border-white/5 p-4 rounded-2xl flex flex-col gap-3 hover:border-white/10 transition-all group ${onClick ? 'cursor-pointer' : ''}`}
    >
       <div className="flex items-center gap-2">
          <div className="p-2 bg-white/5 rounded-lg group-hover:scale-110 transition-transform">
             {icon}
          </div>
          <span className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">{label}</span>
       </div>
       <div className="flex items-end justify-between ml-1">
         <span className="text-2xl font-mono text-ink">{value}</span>
         {sub && (
           <span
             onClick={e => { e.stopPropagation(); onSubClick?.() }}
             className={`text-[10px] text-accent font-medium pb-0.5 ${onSubClick ? 'hover:underline cursor-pointer' : ''}`}
           >{sub}</span>
         )}
       </div>
    </div>
  )
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: ['⌘', 'K'], label: 'Open Search' },
    { keys: ['⌘', 'N'], label: 'Quick Ingest' },
    { keys: ['?'], label: 'Show Shortcuts' },
    { keys: ['Esc'], label: 'Close Modals' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-display text-xl text-ink">Shortcuts</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink"><X size={20}/></button>
        </div>
        <div className="p-6 space-y-4">
          {shortcuts.map(s => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.map(k => (
                  <kbd key={k} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] font-mono text-ink">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
