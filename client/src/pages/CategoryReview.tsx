import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderSync,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Loader2,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import Sidebar from '../components/sidebar/Sidebar'
import { fetchCategoryAnomalies, remapCategory } from '../lib/api'
import type { CategoryAnomaly } from '../../../shared/types'

const CANONICAL_PATHS: string[][] = [
  ['Food'],
  ['Food', 'Bakery', 'Cakes'],
  ['Food', 'Bakery', 'Cookies'],
  ['Food', 'Bakery', 'Bread'],
  ['Food', 'Savory', 'Indian'],
  ['Food', 'Savory', 'Italian'],
  ['Food', 'Savory', 'Thai'],
  ['Food', 'Savory', 'Chinese'],
  ['Media'],
  ['Media', 'Movies'],
  ['Media', 'Movies', 'Action'],
  ['Media', 'Movies', 'Drama'],
  ['Media', 'Movies', 'Horror'],
  ['Media', 'Movies', 'Comedy'],
  ['Media', 'Books'],
  ['Media', 'Books', 'Fiction'],
  ['Media', 'Books', 'Non-Fiction'],
  ['Media', 'Books', 'Technical'],
  ['Tech'],
  ['Tech', 'Laptops'],
  ['Tech', 'Cameras'],
  ['Tech', 'Phones'],
  ['Tech', 'Specs'],
  ['Finance'],
  ['Finance', 'Stocks'],
  ['Finance', 'Crypto'],
  ['Finance', 'Notes'],
  ['Personal'],
  ['Personal', 'Numbers'],
  ['Personal', 'Contacts'],
  ['Links'],
  ['Links', 'YouTube'],
  ['Links', 'Instagram'],
  ['Links', 'Articles'],
  ['Links', 'Docs'],
  ['Travel'],
  ['Travel', 'Destinations'],
  ['Travel', 'Hotels'],
  ['Travel', 'Restaurants'],
  ['Travel', 'Attractions'],
]

function pathLabel(path: string[]): string {
  return path.join(' › ')
}

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

interface AnomalyCardProps {
  anomaly: CategoryAnomaly
  targetPath: string[]
  onTargetChange: (path: string[]) => void
  onRemap: () => void
  remapping: boolean
  done: boolean
}

function AnomalyCard({ anomaly, targetPath, onTargetChange, onRemap, remapping, done }: AnomalyCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: done ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      className={`bg-surface border rounded-xl p-5 transition-all ${
        done ? 'border-green-500/20' : 'border-white/5'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {done ? (
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
            )}
            <span className="font-mono text-sm text-ink font-semibold">"{anomaly.name}"</span>
            <span className="text-xs text-ink-muted">{anomaly.itemCount} item{anomaly.itemCount !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-xs text-ink-muted pl-6">
            Not in the canonical category tree — items may not appear in the right views.
          </p>
        </div>

        {!done && (
          <button
            onClick={onRemap}
            disabled={remapping || targetPath.length === 0}
            className="shrink-0 flex items-center gap-1.5 text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-semibold hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {remapping ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
            Remap
          </button>
        )}
        {done && (
          <span className="shrink-0 text-xs text-green-400 font-medium flex items-center gap-1">
            <CheckCircle2 size={12} /> Done
          </span>
        )}
      </div>

      {/* Remap target selector */}
      {!done && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-ink-muted shrink-0">Remap to:</span>
          <select
            value={pathLabel(targetPath)}
            onChange={e => {
              const found = CANONICAL_PATHS.find(p => pathLabel(p) === e.target.value)
              if (found) onTargetChange(found)
            }}
            className="flex-1 text-xs bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-ink focus:outline-none focus:border-accent/50"
          >
            {CANONICAL_PATHS.map(p => (
              <option key={pathLabel(p)} value={pathLabel(p)}>
                {pathLabel(p)}
              </option>
            ))}
          </select>
          {anomaly.suggestedPath.length > 0 && (
            <button
              onClick={() => onTargetChange(anomaly.suggestedPath)}
              className="shrink-0 text-[10px] text-accent/70 hover:text-accent flex items-center gap-1 transition-colors"
              title="Use AI suggestion"
            >
              <Sparkles size={10} />
              Suggested
            </button>
          )}
        </div>
      )}

      {/* Preview items */}
      <div className="space-y-1.5">
        {anomaly.previewItems.map(item => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/3 rounded-lg">
            <TypeBadge type={item.type} />
            <span className="text-xs text-ink-muted truncate">{item.title}</span>
          </div>
        ))}
        {anomaly.itemCount > anomaly.previewItems.length && (
          <p className="text-[10px] text-ink-muted px-3">
            +{anomaly.itemCount - anomaly.previewItems.length} more items
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default function CategoryReviewPage() {
  const navigate = useNavigate()
  const [anomalies, setAnomalies] = useState<CategoryAnomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-anomaly target path selection (keyed by anomaly id)
  const [targets, setTargets] = useState<Record<string, string[]>>({})
  // Per-anomaly remapping state
  const [remapping, setRemapping] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [remapAllBusy, setRemapAllBusy] = useState(false)

  useEffect(() => {
    fetchCategoryAnomalies()
      .then(data => {
        setAnomalies(data)
        // Pre-populate targets with suggestions
        const initial: Record<string, string[]> = {}
        for (const a of data) {
          initial[a.id] = a.suggestedPath.length > 0 ? a.suggestedPath : CANONICAL_PATHS[0]
        }
        setTargets(initial)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleRemap = async (anomalyId: string) => {
    const toPath = targets[anomalyId]
    if (!toPath || toPath.length === 0) return
    setRemapping(prev => ({ ...prev, [anomalyId]: true }))
    try {
      await remapCategory(anomalyId, toPath)
      setDone(prev => ({ ...prev, [anomalyId]: true }))
    } catch (err: any) {
      alert(`Remap failed: ${err.message}`)
    } finally {
      setRemapping(prev => ({ ...prev, [anomalyId]: false }))
    }
  }

  const handleRemapAll = async () => {
    const pending = anomalies.filter(a => !done[a.id])
    if (pending.length === 0) return
    setRemapAllBusy(true)
    for (const a of pending) {
      const toPath = targets[a.id]
      if (!toPath || toPath.length === 0) continue
      setRemapping(prev => ({ ...prev, [a.id]: true }))
      try {
        await remapCategory(a.id, toPath)
        setDone(prev => ({ ...prev, [a.id]: true }))
      } catch {
        // continue with others
      } finally {
        setRemapping(prev => ({ ...prev, [a.id]: false }))
      }
    }
    setRemapAllBusy(false)
  }

  const pendingCount = anomalies.filter(a => !done[a.id]).length
  const allDone = anomalies.length > 0 && pendingCount === 0

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Sidebar activeSection="category-review" />

      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-ink-muted text-sm mb-3">
              <button onClick={() => navigate('/settings')} className="hover:text-ink transition-colors">
                Settings
              </button>
              <ChevronRight size={14} />
              <span className="text-ink">Category Review</span>
            </div>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display text-3xl text-ink mb-2 flex items-center gap-3">
                  <FolderSync size={28} className="text-accent" />
                  Category Review
                </h1>
                <p className="text-ink-muted text-sm">
                  Root categories not in the canonical tree. Remap their items so they appear in the correct views.
                </p>
              </div>
              {!loading && pendingCount > 1 && !allDone && (
                <button
                  onClick={handleRemapAll}
                  disabled={remapAllBusy}
                  className="shrink-0 flex items-center gap-2 text-sm bg-accent text-bg px-4 py-2 rounded-lg font-semibold hover:bg-accent/80 disabled:opacity-40 transition-all"
                >
                  {remapAllBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Remap All ({pendingCount})
                </button>
              )}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 text-ink-muted py-12 justify-center">
              <Loader2 size={20} className="animate-spin" />
              <span>Scanning categories…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* All clean */}
          {!loading && !error && anomalies.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-20 text-center"
            >
              <CheckCircle2 size={48} className="text-green-400" />
              <div>
                <p className="text-ink font-semibold text-lg">All categories are canonical</p>
                <p className="text-ink-muted text-sm mt-1">No rogue root categories found.</p>
              </div>
            </motion.div>
          )}

          {/* All done after remapping */}
          {!loading && !error && allDone && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-12 text-center"
            >
              <CheckCircle2 size={48} className="text-green-400" />
              <div>
                <p className="text-ink font-semibold text-lg">All remapped</p>
                <p className="text-ink-muted text-sm mt-1">Reload the page to verify the category tree.</p>
              </div>
            </motion.div>
          )}

          {/* Anomaly cards */}
          {!loading && !error && anomalies.length > 0 && (
            <div className="space-y-4">
              <AnimatePresence>
                {anomalies.map(a => (
                  <AnomalyCard
                    key={a.id}
                    anomaly={a}
                    targetPath={targets[a.id] ?? CANONICAL_PATHS[0]}
                    onTargetChange={path => setTargets(prev => ({ ...prev, [a.id]: path }))}
                    onRemap={() => handleRemap(a.id)}
                    remapping={!!remapping[a.id]}
                    done={!!done[a.id]}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
