import { useState, useEffect, useRef } from 'react'
import { Plus, Search, HelpCircle, X, Zap, Database, Key, Clock, Sparkles, Calendar, TrendingUp, Lightbulb, Link2, Compass, Loader2, CheckCircle, Newspaper } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AppHeader } from '../components/AppHeader'
import Sidebar from '../components/sidebar/Sidebar'
import ItemCard from '../components/cards/ItemCard'
import { CardSkeleton } from '../components/Skeleton'
import { fetchItems, fetchStats, fetchInsights as fetchDashboardInsights, fetchRediscovery } from '../lib/api'
import type { Item, StatsResponse, Insight, RediscoveryItem } from '../../../shared/types'

// Local helper: format a reminder date relative to now
function formatReminder(date: Date): string {
  const diff = date.getTime() - Date.now()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.round(diff / 3600000)
  if (hrs < 24) return `in ${hrs}h`
  const days = Math.round(diff / 86400000)
  if (days === 1) return 'tomorrow'
  return `in ${days}d`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [rediscovery, setRediscovery] = useState<RediscoveryItem[]>([])
  const [upcomingReminders, setUpcomingReminders] = useState<Item[]>([])
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  )
  const [loading, setLoading] = useState(true)
  const [loadingInsights, setLoadingInsights] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [itemsError, setItemsError] = useState(false)
  const [statsError, setStatsError] = useState(false)
  const [insightsError, setInsightsError] = useState(false)
  const [rediscoveryError, setRediscoveryError] = useState(false)
  const [remindersError, setRemindersError] = useState(false)
  const [offset, setOffset] = useState(0)
  // Bumped on every load and on unmount so a slow response from an older load
  // can't overwrite newer state (or set state after the page is gone).
  const loadSeq = useRef(0)

  const loadInsightData = async () => {
    setLoadingInsights(true)
    setInsightsError(false)
    try { setInsights(await fetchDashboardInsights()) }
    catch { setInsightsError(true); setInsights([]) }
    finally { setLoadingInsights(false) }
  }

  const loadRediscoveryData = async () => {
    setRediscoveryError(false)
    try { setRediscovery(await fetchRediscovery()) }
    catch { setRediscoveryError(true); setRediscovery([]) }
  }

  const enableBrowserReminders = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      if (permission === 'granted') window.dispatchEvent(new Event('memex:notification-permission-changed'))
    } catch {
      setNotificationPermission('denied')
    }
  }

  useEffect(() => {
    loadData()
    const onCaptured = () => loadData()
    window.addEventListener('memex:item-captured', onCaptured)
    return () => {
      loadSeq.current += 1
      window.removeEventListener('memex:item-captured', onCaptured)
    }
  }, [])

  const loadData = async () => {
    const seq = ++loadSeq.current
    const isCurrent = () => seq === loadSeq.current

    setLoading(true)
    setOffset(0)
    setItemsError(false)
    setStatsError(false)
    void loadInsightData()
    void loadRediscoveryData()

    // Fire upcoming reminders check in background (non-blocking)
    fetchItems({ hasReminder: true, limit: 5 })
      .then(r => {
        if (!isCurrent()) return
        setRemindersError(false)
        setUpcomingReminders(r.items.filter(i => i.remindAt && new Date(i.remindAt) > new Date()))
      })
      .catch(() => { if (isCurrent()) { setRemindersError(true); setUpcomingReminders([]) } })

    const [itemsResult, statsResult] = await Promise.allSettled([
      fetchItems({ limit: 12, offset: 0 }),
      fetchStats(),
    ])
    if (!isCurrent()) return
    if (itemsResult.status === 'fulfilled') {
      setItems(itemsResult.value.items)
      setTotal(itemsResult.value.total)
      setItemsError(false)
    } else { setItemsError(true); setItems([]); setTotal(0) }
    if (statsResult.status === 'fulfilled') { setStats(statsResult.value); setStatsError(false) }
    else { setStatsError(true); setStats(null) }
    setLoading(false)
  }

  const loadMoreItems = async () => {
    const nextOffset = offset + 12
    setLoadingMore(true)
    try {
      const res = await fetchItems({ limit: 12, offset: nextOffset })
      setItems(prev => [...prev, ...res.items])
      setOffset(nextOffset)
    } catch (err) {
      toast.error('Failed to load more items')
    } finally {
      setLoadingMore(false)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === '?' && !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        setShowShortcuts(prev => !prev)
      }
      if (e.key === 'Escape') {
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
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col relative">
        <AppHeader
          left={
            <button
              type="button"
              aria-label="Search everything (press slash)"
              onClick={() => window.dispatchEvent(new Event('memex:open-search'))}
              className="flex items-center gap-4 bg-surface/80 px-4 py-2 rounded-full border border-white/5 w-96 max-w-full text-left cursor-pointer hover:border-accent/30 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Search size={18} className="text-ink-muted group-hover:text-accent transition-colors" />
              <span className="text-ink-muted/50 text-sm flex-1">Search everything...</span>
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 rounded border border-white/5 text-[10px] text-ink-muted font-mono">
                /
              </div>
            </button>
          }
          actions={
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-ink-muted"
              title="Keyboard Shortcuts"
            >
              <HelpCircle size={20} />
            </button>
          }
        />
        <AppHeader.Spacer />

        {/* Hero Section */}
        <div className="p-5 sm:p-8 xl:p-12 max-w-7xl mx-auto w-full flex flex-col gap-8 md:gap-10">
          <section className="flex flex-col gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-2">
                <h2 className="font-display text-3xl md:text-4xl text-ink">Welcome back</h2>
                <p className="text-ink-muted max-w-lg">
                  Capture what matters, then find and revisit it when you need it. AI organization follows your configured provider and privacy settings.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => window.dispatchEvent(new Event('memex:open-capture'))} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-bg hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Plus size={16} />Capture something</button>
                <button type="button" onClick={() => navigate('/ask')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"><Sparkles size={16} className="text-accent" />Ask your library</button>
                <button type="button" onClick={() => navigate('/digest')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-ink-muted hover:bg-white/5 hover:text-ink"><Newspaper size={16} />Weekly digest</button>
                <button type="button" onClick={() => navigate('/graph')} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-ink-muted hover:bg-white/5 hover:text-ink"><Compass size={16} />Explore connections</button>
              </div>
            </div>

            {/* Actionable Insights */}
            <div className="order-2 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Sparkles size={16} className="text-accent" />
                <h3 className="font-display text-lg text-ink">Actionable Insights</h3>
              </div>
              
              {loadingInsights ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : insightsError ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-ink-muted">
                  <span>Insights couldn’t be loaded. Your library and search are still available.</span>
                  <button type="button" onClick={loadInsightData} className="rounded-lg px-3 py-2 font-medium text-accent hover:bg-accent/10">Retry</button>
                </div>
              ) : insights.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <AnimatePresence mode="popLayout">
                    {insights.map((insight, idx) => (
                      <motion.div 
                        key={insight.id || idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-gradient-to-br from-accent/5 to-transparent border border-accent/20 p-4 rounded-2xl hover:border-accent/40 transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 text-accent">
                            {insight.type === 'event' && <Calendar size={16} />}
                            {insight.type === 'habit' && <TrendingUp size={16} />}
                            {insight.type === 'suggestion' && <Lightbulb size={16} />}
                            {insight.type === 'connection' && <Link2 size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-ink group-hover:text-accent transition-colors truncate">
                              {insight.title}
                            </h4>
                            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                              {insight.description}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="p-6 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl text-center">
                  <p className="text-sm text-ink-muted">
                    No insights to show yet. They appear when there’s a useful pattern in your library.
                  </p>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="order-1">
              {stats ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
               <StatCard
                 icon={<Database size={18} className="text-blue-400" />}
                 label="Total Items"
                 value={stats.totalItems}
               />
               <StatCard
                 icon={<Zap size={18} className="text-yellow-400" />}
                 label="AI Enriched"
                 value={stats.aiEnriched}
                 sub={stats && stats.pendingAI > 0 ? `${stats.pendingAI} pending` : undefined}
                 onClick={() => navigate('/items/enriched')}
                 onSubClick={stats && stats.pendingAI > 0 ? () => navigate('/items/pending') : undefined}
               />
               <StatCard
                 icon={<CheckCircle size={18} className="text-green-400" />}
                 label="Reviewed"
                 value={stats.reviewed}
                 sub={stats && stats.unreviewed > 0 ? `${stats.unreviewed} to review` : undefined}
                 onClick={() => navigate('/items/enriched')}
                 onSubClick={stats && stats.unreviewed > 0 ? () => navigate('/items/pending') : undefined}
               />
               <StatCard
                 icon={<Key size={18} className="text-teal-400" />}
                 label="Secrets in Vault"
                 value={stats.totalVaultItems}
               />
               <StatCard
                 icon={<Clock size={18} className="text-purple-400" />}
                 label="Last 24h Activity"
                 value={stats.recentActivity}
               />
              </div> : statsError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-ink-muted"><span>Library overview couldn’t be loaded.</span><button type="button" onClick={loadData} className="rounded-lg px-3 py-2 font-medium text-accent hover:bg-accent/10">Retry</button></div> : <div role="status" aria-label="Loading library overview" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-white/5 bg-white/5" />)}</div>}
            </div>
          </section>

          {/* Upcoming Reminders */}
          {(upcomingReminders.length > 0 || remindersError) && (
            <section className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-accent" />
                <h3 className="font-display text-xl text-ink">Upcoming Reminders</h3>
              </div>
              {upcomingReminders.length > 0 && notificationPermission === 'default' && (
                <button type="button" onClick={enableBrowserReminders} className="w-fit rounded-lg border border-accent/20 px-3 py-2 text-sm text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  Enable browser notifications
                </button>
              )}
              {upcomingReminders.length > 0 && notificationPermission === 'denied' && (
                <p className="text-sm text-ink-muted">Browser notifications are blocked. You can still see reminders here.</p>
              )}
              {notificationPermission === 'unsupported' && upcomingReminders.length > 0 && (
                <p className="text-sm text-ink-muted">This browser does not support notifications. You can still see reminders here.</p>
              )}
              {remindersError ? <p role="status" className="text-sm text-ink-muted">Reminders couldn’t be loaded right now.</p> : <div className="flex flex-col gap-2">
                {upcomingReminders.map(item => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/item/${item.id}`)}
                    className="flex items-center gap-4 px-5 py-3 bg-accent/5 border border-accent/15 rounded-xl hover:border-accent/30 transition-all text-left"
                  >
                    <div className="text-center shrink-0">
                      <p className="text-lg font-bold text-accent leading-none">
                        {item.remindAt ? formatReminder(new Date(item.remindAt)) : ''}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-ink font-medium truncate">{item.title}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {item.remindAt ? new Date(item.remindAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>}
            </section>
          )}

          {/* Rediscovery / Serendipity */}
          {(rediscovery.length > 0 || rediscoveryError) && (
            <section className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-4">
              <div className="flex items-center gap-3">
                <Compass size={20} className="text-purple-400" />
                <h3 className="font-display text-xl text-ink">Rediscover</h3>
              </div>
              {rediscoveryError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-ink-muted"><span>Rediscovery couldn’t be loaded.</span><button type="button" onClick={loadRediscoveryData} className="rounded-lg px-3 py-2 font-medium text-accent hover:bg-accent/10">Retry</button></div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rediscovery.map(({ reason, item }) => (
                  <div key={item.id} className="relative group">
                    <div className="absolute -top-3 left-4 px-3 py-1 bg-surface border border-purple-500/30 text-[9px] uppercase tracking-widest font-bold text-purple-400 rounded-lg shadow-lg z-10">
                      {reason}
                    </div>
                    <ItemCard item={item} onClick={() => navigate(`/item/${item.id}`)} />
                  </div>
                ))}
              </div>}
            </section>
          )}

          {/* Recent Items */}
          <section className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-ink">Recent Additions</h3>
              <button onClick={() => navigate('/items/table')} className="text-xs text-accent hover:underline font-medium">View All (Table)</button>
            </div>
            
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : itemsError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-ink-muted"><span>Recent items couldn’t be loaded.</span><button type="button" onClick={loadData} className="rounded-lg px-3 py-2 font-medium text-accent hover:bg-accent/10">Retry</button></div>
            ) : items.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map(item => (
                    <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />
                  ))}
                </div>
                {items.length < total && (
                  <div className="flex justify-center mt-8">
                    <button 
                      onClick={loadMoreItems}
                      disabled={loadingMore}
                      className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl text-sm font-bold text-ink-muted hover:text-ink transition-all flex items-center gap-3 disabled:opacity-50"
                    >
                      {loadingMore && <Loader2 size={16} className="animate-spin" />}
                      {loadingMore ? 'Loading...' : 'Load More Additions'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-surface/40 px-5 py-10 flex flex-col items-center justify-center text-center text-ink-muted gap-3">
                <p className="text-base font-medium text-ink">Your library is ready for its first item.</p>
                <p className="text-sm">Capture a note, link, file, or voice memo to get started.</p>
                <button type="button"
                  onClick={() => window.dispatchEvent(new Event('memex:open-capture'))}
                  className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-bg hover:bg-accent/90"
                >
                  <Plus size={16} />Add your first item
                </button>
              </div>
            )}
          </section>
        </div>

        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

        {/* Floating Action Button */}
        <button 
          onClick={() => window.dispatchEvent(new Event('memex:open-capture'))}
          className="fixed bottom-8 right-8 hidden h-14 w-14 items-center justify-center rounded-full bg-accent text-bg shadow-2xl transition-all hover:scale-110 hover:bg-accent-dark active:scale-95 z-40 group md:flex"
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
    <article className="bg-surface/50 border border-white/5 p-4 rounded-2xl flex flex-col gap-3 hover:border-white/10 transition-all group">
       <div className="flex items-center gap-2">
          <div className="p-2 bg-white/5 rounded-lg group-hover:scale-110 transition-transform">
             {icon}
          </div>
          <span className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">{label}</span>
       </div>
       <div className="flex items-end justify-between ml-1">
         <span className="text-2xl font-mono text-ink">{value}</span>
         {sub && (
          onSubClick ? <button type="button" onClick={onSubClick} className="text-left text-[10px] text-accent font-medium pb-0.5 hover:underline">{sub}</button> : <span className="text-[10px] text-ink-muted font-medium pb-0.5">{sub}</span>
         )}
       </div>
       {onClick && <button type="button" onClick={onClick} className="mt-auto self-start text-xs font-medium text-ink-muted hover:text-accent">View {label.toLowerCase()} <span aria-hidden="true">→</span></button>}
    </article>
  )
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: ['/'], label: 'Open Search' },
    { keys: ['N'], label: 'Quick Ingest' },
    { keys: ['?'], label: 'Show Shortcuts' },
    { keys: ['Esc'], label: 'Close Modals' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-display text-xl text-ink">Shortcuts</h3>
          <button onClick={onClose} aria-label="Close shortcuts" className="text-ink-muted hover:text-ink"><X size={20} aria-hidden="true" /></button>
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
