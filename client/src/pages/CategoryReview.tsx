import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderSync,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Sparkles,
  ArrowLeft,
  Check,
  FolderPen,
  X,
} from 'lucide-react'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import {
  fetchCategoryAnomalies,
  remapCategory,
  fetchItems,
  updateItem,
} from '../lib/api'
import type { CategoryAnomaly, Item } from '../../../shared/types'

// ── Canonical path list for anomaly remapping ────────────────────────────────

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

// ── Shared display components ─────────────────────────────────────────────────

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
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${colours[type] ?? 'bg-white/5 text-ink-muted'}`}>
      {type}
    </span>
  )
}

function ConfidenceBadge({ score }: { score?: number | null }) {
  if (score == null) return null
  const cls =
    score >= 90 ? 'bg-green-500/10 text-green-400' :
    score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
    score >= 50 ? 'bg-amber-500/10 text-amber-400' :
                  'bg-red-500/10 text-red-400'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium shrink-0 ${cls}`}>
      {score}%
    </span>
  )
}

function TabButton({
  active, onClick, label, count,
}: {
  active: boolean; onClick: () => void; label: string; count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
          active ? 'bg-accent/20 text-accent' : 'bg-white/10 text-ink-muted'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ── Staged item card ──────────────────────────────────────────────────────────

interface StagedItemCardProps {
  item: Item
  onAccept: (id: string) => Promise<void>
  onReassign: (id: string, categories: string[]) => Promise<void>
}

function StagedItemCard({ item, onAccept, onReassign }: StagedItemCardProps) {
  const navigate = useNavigate()
  const [reassigning, setReassigning] = useState(false)
  const [catInput, setCatInput] = useState(item.categories.join(' › '))
  const [accepting, setAccepting] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleAcceptClick = async () => {
    setAccepting(true)
    try { await onAccept(item.id) }
    catch (e: any) { alert(e.message) }
    finally { setAccepting(false) }
  }

  const handleSaveReassign = async () => {
    const parts = catInput.split(/[>›\/,]/).map(s => s.trim()).filter(Boolean)
    if (!parts.length) return
    setSaving(true)
    try { await onReassign(item.id, parts) }
    catch (e: any) { alert(e.message) }
    finally { setSaving(false); setReassigning(false) }
  }

  const preview = (item.content ?? '').slice(0, 200).replace(/\n+/g, ' ')

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.22 }}
      className="bg-surface border border-white/5 rounded-xl p-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <TypeBadge type={item.type} />
          <ConfidenceBadge score={item.confidence} />
          {item.intent && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              item.intent === 'actionable'
                ? 'bg-amber-500/10 text-amber-400'
                : item.intent === 'idea'
                ? 'bg-purple-500/10 text-purple-400'
                : 'bg-white/5 text-ink-muted'
            }`}>
              {item.intent}
            </span>
          )}
          <button
            onClick={() => navigate(`/item/${item.id}`)}
            className="text-sm font-medium text-ink hover:text-accent transition-colors text-left"
          >
            {item.title}
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleAcceptClick}
            disabled={accepting}
            className="flex items-center gap-1 text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 px-2.5 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40"
          >
            {accepting ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Accept
          </button>
          <button
            onClick={() => { setReassigning(r => !r); setCatInput(item.categories.join(' › ')) }}
            className="flex items-center gap-1 text-xs bg-white/5 text-ink-muted hover:text-ink hover:bg-white/10 px-2.5 py-1.5 rounded-lg font-medium transition-all"
          >
            <FolderPen size={11} /> Reassign
          </button>
        </div>
      </div>

      {/* Category path */}
      {item.categories.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          {item.categories.map((cat, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-[10px] text-ink-muted/70">{cat}</span>
              {i < item.categories.length - 1 && (
                <span className="text-[10px] text-ink-muted/30">›</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Content preview */}
      {preview && (
        <p className="text-[11px] text-ink-muted/50 line-clamp-2">{preview}</p>
      )}

      {/* Inline reassign form */}
      {reassigning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 pt-3 border-t border-white/5"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={catInput}
              onChange={e => setCatInput(e.target.value)}
              placeholder="Food › Bakery › Cakes"
              className="flex-1 text-xs bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-ink focus:outline-none focus:border-accent/50"
              onKeyDown={e => e.key === 'Enter' && handleSaveReassign()}
              autoFocus
            />
            <button
              onClick={handleSaveReassign}
              disabled={saving}
              className="flex items-center gap-1 text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium hover:bg-accent/80 disabled:opacity-40 transition-all"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Save
            </button>
            <button
              onClick={() => setReassigning(false)}
              className="text-ink-muted hover:text-ink p-1.5 rounded-lg hover:bg-white/5 transition-all"
            >
              <X size={13} />
            </button>
          </div>
          <p className="text-[10px] text-ink-muted/40 mt-1.5">
            Separate levels with › or &gt; — e.g. Media › Movies › Action
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}

// ── Anomaly card (rogue root categories) ─────────────────────────────────────

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
      className={`bg-surface border rounded-xl p-5 transition-all ${done ? 'border-green-500/20' : 'border-white/5'}`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {done
              ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              : <AlertTriangle size={16} className="text-amber-400 shrink-0" />}
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
              <option key={pathLabel(p)} value={pathLabel(p)}>{pathLabel(p)}</option>
            ))}
          </select>
          {anomaly.suggestedPath.length > 0 && (
            <button
              onClick={() => onTargetChange(anomaly.suggestedPath)}
              className="shrink-0 text-[10px] text-accent/70 hover:text-accent flex items-center gap-1 transition-colors"
              title="Use AI suggestion"
            >
              <Sparkles size={10} /> Suggested
            </button>
          )}
        </div>
      )}

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CategoryReviewPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'staged' | 'anomalies'>('staged')
  const [threshold, setThreshold] = useState(70)

  // Staged items state
  const [stagedItems, setStagedItems] = useState<Item[]>([])
  const [stagedLoading, setStagedLoading] = useState(true)
  const [stagedError, setStagedError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [acceptingAll, setAcceptingAll] = useState(false)

  // Anomalies state
  const [anomalies, setAnomalies] = useState<CategoryAnomaly[]>([])
  const [anomaliesLoading, setAnomaliesLoading] = useState(true)
  const [anomaliesError, setAnomaliesError] = useState<string | null>(null)
  const [targets, setTargets] = useState<Record<string, string[]>>({})
  const [remapping, setRemapping] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [remapAllBusy, setRemapAllBusy] = useState(false)

  // Load staged items whenever threshold changes
  useEffect(() => {
    setStagedLoading(true)
    setStagedError(null)
    setAccepted(new Set())
    fetchItems({ enriched: true, unreviewed: true, maxConfidence: threshold, limit: 100 })
      .then(({ items }) => setStagedItems(items))
      .catch(err => setStagedError(err.message))
      .finally(() => setStagedLoading(false))
  }, [threshold])

  // Load anomalies once
  useEffect(() => {
    fetchCategoryAnomalies()
      .then(data => {
        setAnomalies(data)
        const initial: Record<string, string[]> = {}
        for (const a of data) {
          initial[a.id] = a.suggestedPath.length > 0 ? a.suggestedPath : CANONICAL_PATHS[0]
        }
        setTargets(initial)
      })
      .catch(err => setAnomaliesError(err.message))
      .finally(() => setAnomaliesLoading(false))
  }, [])

  const handleAccept = useCallback(async (id: string) => {
    await updateItem(id, { reviewed: true })
    setAccepted(prev => new Set([...prev, id]))
  }, [])

  const handleReassign = useCallback(async (id: string, categories: string[]) => {
    await updateItem(id, { categories, reviewed: true })
    setAccepted(prev => new Set([...prev, id]))
  }, [])

  const handleAcceptAll = async () => {
    const pending = stagedItems.filter(item => !accepted.has(item.id))
    if (!pending.length) return
    setAcceptingAll(true)
    await Promise.all(
      pending.map(item =>
        updateItem(item.id, { reviewed: true })
          .then(() => setAccepted(prev => new Set([...prev, item.id])))
          .catch(() => {}),
      ),
    )
    setAcceptingAll(false)
  }

  const handleRemap = async (anomalyId: string) => {
    const toPath = targets[anomalyId]
    if (!toPath?.length) return
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
    if (!pending.length) return
    setRemapAllBusy(true)
    for (const a of pending) {
      const toPath = targets[a.id]
      if (!toPath?.length) continue
      setRemapping(prev => ({ ...prev, [a.id]: true }))
      try {
        await remapCategory(a.id, toPath)
        setDone(prev => ({ ...prev, [a.id]: true }))
      } catch { /* continue */ }
      finally {
        setRemapping(prev => ({ ...prev, [a.id]: false }))
      }
    }
    setRemapAllBusy(false)
  }

  const pendingStaged = stagedItems.filter(item => !accepted.has(item.id))
  const pendingAnomalies = anomalies.filter(a => !done[a.id]).length

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Sidebar activeSection="category-review" />

      <main className="flex-1 overflow-y-auto p-8">
        <AppHeader
          left={
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="text-ink-muted hover:text-ink transition-colors">
                <ArrowLeft size={20} />
              </button>
              <FolderSync size={18} className="text-ink-muted" />
              <h1 className="font-display text-lg text-ink">Category Review</h1>
            </div>
          }
          actions={
            activeTab === 'staged' && pendingStaged.length > 1
              ? (
                <button
                  onClick={handleAcceptAll}
                  disabled={acceptingAll}
                  className="flex items-center gap-2 text-sm bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 px-4 py-2 rounded-lg font-semibold disabled:opacity-40 transition-all"
                >
                  {acceptingAll ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Accept All ({pendingStaged.length})
                </button>
              )
              : activeTab === 'anomalies' && pendingAnomalies > 1
              ? (
                <button
                  onClick={handleRemapAll}
                  disabled={remapAllBusy}
                  className="flex items-center gap-2 text-sm bg-accent text-bg px-4 py-2 rounded-lg font-semibold hover:bg-accent/80 disabled:opacity-40 transition-all"
                >
                  {remapAllBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Remap All ({pendingAnomalies})
                </button>
              )
              : undefined
          }
        />
        <AppHeader.Spacer />

        <div className="max-w-2xl mx-auto">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-8 bg-surface rounded-xl p-1 border border-white/5 w-fit">
            <TabButton
              active={activeTab === 'staged'}
              onClick={() => setActiveTab('staged')}
              label="Staged Items"
              count={pendingStaged.length}
            />
            <TabButton
              active={activeTab === 'anomalies'}
              onClick={() => setActiveTab('anomalies')}
              label="Category Anomalies"
              count={pendingAnomalies}
            />
          </div>

          {/* ── Staged items tab ──────────────────────────────────────────── */}
          {activeTab === 'staged' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-xs text-ink-muted">Show items with confidence below</span>
                <select
                  value={threshold}
                  onChange={e => setThreshold(Number(e.target.value))}
                  className="text-xs bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-ink focus:outline-none focus:border-accent/50"
                >
                  <option value={50}>50%</option>
                  <option value={60}>60%</option>
                  <option value={70}>70% (default)</option>
                  <option value={80}>80%</option>
                  <option value={90}>90%</option>
                </select>
              </div>

              {stagedLoading && (
                <div className="flex items-center gap-3 text-ink-muted py-12 justify-center">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Loading staged items…</span>
                </div>
              )}

              {stagedError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                  {stagedError}
                </div>
              )}

              {!stagedLoading && !stagedError && pendingStaged.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 py-20 text-center"
                >
                  <CheckCircle2 size={48} className="text-green-400" />
                  <div>
                    <p className="text-ink font-semibold text-lg">
                      {stagedItems.length > 0 ? 'All reviewed!' : 'Nothing to stage'}
                    </p>
                    <p className="text-ink-muted text-sm mt-1">
                      No unreviewed items below {threshold}% confidence.
                    </p>
                  </div>
                </motion.div>
              )}

              {!stagedLoading && !stagedError && pendingStaged.length > 0 && (
                <div className="space-y-3">
                  <AnimatePresence>
                    {pendingStaged.map(item => (
                      <StagedItemCard
                        key={item.id}
                        item={item}
                        onAccept={handleAccept}
                        onReassign={handleReassign}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* ── Anomalies tab ─────────────────────────────────────────────── */}
          {activeTab === 'anomalies' && (
            <div>
              <p className="text-ink-muted text-sm mb-6">
                Root categories not in the canonical tree. Remap their items so they appear in the correct views.
              </p>

              {anomaliesLoading && (
                <div className="flex items-center gap-3 text-ink-muted py-12 justify-center">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Scanning categories…</span>
                </div>
              )}

              {anomaliesError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                  {anomaliesError}
                </div>
              )}

              {!anomaliesLoading && !anomaliesError && (anomalies.length === 0 || pendingAnomalies === 0) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 py-20 text-center"
                >
                  <CheckCircle2 size={48} className="text-green-400" />
                  <div>
                    <p className="text-ink font-semibold text-lg">
                      {anomalies.length === 0 ? 'All categories are canonical' : 'All remapped'}
                    </p>
                    <p className="text-ink-muted text-sm mt-1">No rogue root categories found.</p>
                  </div>
                </motion.div>
              )}

              {!anomaliesLoading && !anomaliesError && anomalies.length > 0 && (
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
          )}
        </div>
      </main>
    </div>
  )
}
