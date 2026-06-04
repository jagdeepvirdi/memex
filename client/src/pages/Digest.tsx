import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Link2,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import ItemCard from '../components/cards/ItemCard'
import { fetchDigest } from '../lib/api'
import type { DigestResponse } from '../../../shared/types'

function TypeBadge({ type }: { type: string }) {
  const colours: Record<string, string> = {
    note: 'bg-white/5 text-ink-muted',
    recipe: 'bg-amber-500/10 text-amber-400',
    media: 'bg-blue-500/10 text-blue-400',
    book: 'bg-purple-500/10 text-purple-400',
    place: 'bg-green-500/10 text-green-400',
    link: 'bg-sky-500/10 text-sky-400',
    stock: 'bg-emerald-500/10 text-emerald-400',
    spec: 'bg-orange-500/10 text-orange-400',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colours[type] ?? 'bg-white/5 text-ink-muted'}`}>
      {type}
    </span>
  )
}

export default function DigestPage() {
  const navigate = useNavigate()
  const [digest, setDigest] = useState<DigestResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchDigest()
      .then(setDigest)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const trend = digest
    ? digest.weekCount > digest.prevWeekCount ? 'up'
    : digest.weekCount < digest.prevWeekCount ? 'down'
    : 'flat'
    : 'flat'

  const trendDiff = digest ? Math.abs(digest.weekCount - digest.prevWeekCount) : 0

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Sidebar activeSection="digest" />

      <main className="flex-1 overflow-y-auto">
        <AppHeader
          left={<div className="flex items-center gap-3"><Newspaper size={18} className="text-ink-muted" /><h1 className="font-display text-lg text-ink">Weekly Digest</h1></div>}
          actions={!loading ? <button onClick={load} className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg transition-all"><RefreshCw size={13} /> Regenerate</button> : undefined}
        />
        <AppHeader.Spacer />
        <div className="max-w-4xl mx-auto px-8 py-10">

          {/* Period subtitle */}
          {digest && (
            <p className="text-ink-muted text-sm mb-10">{digest.period}</p>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-4 py-24 text-ink-muted">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Generating your digest… this may take a moment.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">{error}</div>
          )}

          {digest && !loading && (
            <div className="space-y-12">

              {/* Week stats */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <div className="flex items-center gap-8 p-6 bg-surface/50 border border-white/5 rounded-2xl">
                  <div>
                    <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold mb-1">This Week</p>
                    <p className="text-5xl font-display text-ink font-bold">{digest.weekCount}</p>
                    <p className="text-xs text-ink-muted mt-1">items saved</p>
                  </div>
                  <div className="h-12 w-px bg-white/10" />
                  <div>
                    <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold mb-1">vs Last Week</p>
                    <div className="flex items-center gap-2">
                      {trend === 'up' && <TrendingUp size={20} className="text-green-400" />}
                      {trend === 'down' && <TrendingDown size={20} className="text-red-400" />}
                      {trend === 'flat' && <Minus size={20} className="text-ink-muted" />}
                      <span className={`text-2xl font-bold ${
                        trend === 'up' ? 'text-green-400' :
                        trend === 'down' ? 'text-red-400' : 'text-ink-muted'
                      }`}>
                        {trend === 'flat' ? 'same' : `${trend === 'up' ? '+' : '-'}${trendDiff}`}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted mt-1">{digest.prevWeekCount} last week</p>
                  </div>
                </div>
              </motion.section>

              {/* This week's additions */}
              {digest.recentItems.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h2 className="font-display text-xl text-ink mb-5 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">{digest.recentItems.length}</span>
                    Added this week
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {digest.recentItems.map(item => (
                      <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />
                    ))}
                  </div>
                </motion.section>
              )}

              {digest.recentItems.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12 text-ink-muted bg-white/3 rounded-2xl border border-dashed border-white/10"
                >
                  <p className="font-medium text-ink mb-1">Nothing saved this week</p>
                  <p className="text-sm">Open the Quick Add panel to start capturing.</p>
                </motion.div>
              )}

              {/* On this day */}
              {digest.onThisDay && (
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="font-display text-xl text-ink mb-5 flex items-center gap-2">
                    <Calendar size={20} className="text-purple-400" />
                    On this day
                  </h2>
                  <div className="relative">
                    <div className="absolute -top-3 left-4 z-10 px-3 py-1 bg-surface border border-purple-500/30 text-[9px] uppercase tracking-widest font-bold text-purple-400 rounded-lg shadow-lg">
                      {digest.onThisDay.reason}
                    </div>
                    <ItemCard item={digest.onThisDay.item} onClick={() => navigate(`/item/${digest.onThisDay!.item.id}`)} />
                  </div>
                </motion.section>
              )}

              {/* AI Connection */}
              {digest.connection && (
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h2 className="font-display text-xl text-ink mb-5 flex items-center gap-2">
                    <Link2 size={20} className="text-accent" />
                    Unexpected connection
                  </h2>
                  <div className="bg-surface/50 border border-accent/10 rounded-2xl p-6">
                    {/* Two items */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      {[digest.connection.item1, digest.connection.item2].map((item, i) => (
                        <button
                          key={item.id}
                          onClick={() => navigate(`/item/${item.id}`)}
                          className="text-left p-4 bg-white/5 hover:bg-white/8 border border-white/5 hover:border-white/10 rounded-xl transition-all"
                        >
                          <TypeBadge type={item.type} />
                          <p className="text-sm font-medium text-ink mt-2 line-clamp-2">{item.title}</p>
                          <p className="text-xs text-ink-muted mt-1 line-clamp-2 leading-relaxed">{item.summary}</p>
                          <p className="text-[10px] text-accent/50 mt-2">{i === 0 ? '← note 1' : 'note 2 →'}</p>
                        </button>
                      ))}
                    </div>

                    {/* The insight */}
                    <div className="flex items-start gap-3 bg-accent/5 border border-accent/15 rounded-xl px-5 py-4">
                      <Link2 size={16} className="text-accent shrink-0 mt-0.5" />
                      <p className="text-sm text-ink leading-relaxed italic">"{digest.connection.insight}"</p>
                    </div>
                  </div>
                </motion.section>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
