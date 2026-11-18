import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Settings, LogOut, Brain, Check, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAiStatus } from '../hooks/useAiStatus'
import { DemoBanner } from './DemoBanner'

interface Props {
  /** Left side — search bar (Dashboard) or back-button + title (all other pages) */
  left: ReactNode
  /**
   * Page-specific actions. From md up they sit in the bar before the common controls; on a phone the bar has no room,
   * so they get a row of their own under it (scrolls sideways if it must).
   */
  actions?: ReactNode
}

// <AppHeader.Spacer /> is a separate element, so it learns through this tiny store whether the phone-only actions row
// is showing and adds its height. (Set in a layout effect, so the content never jumps down after first paint.)
let actionsRowShown = false
const rowListeners = new Set<() => void>()
const setActionsRowShown = (v: boolean) => {
  if (actionsRowShown === v) return
  actionsRowShown = v
  rowListeners.forEach(l => l())
}
const subscribeRow = (l: () => void) => { rowListeners.add(l); return () => { rowListeners.delete(l) } }
const getRow = () => actionsRowShown

/**
 * Fixed top header shared by every authenticated page.
 * Always shows AI status, settings and the profile dropdown on the right.
 *
 * Include <AppHeader.Spacer /> immediately after <AppHeader> in each page so
 * content doesn't slide under the fixed bar.
 */
export function AppHeader({ left, actions }: Props) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { aiStatus, enrichment, eta, isOnline } = useAiStatus()
  const [showProfile, setShowProfile] = useState(false)
  const hasActions = !!actions
  useLayoutEffect(() => {
    setActionsRowShown(hasActions)
    return () => setActionsRowShown(false)
  }, [hasActions])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    // The sidebar is hidden below md, so the bar starts at the left edge there; with left-64 it left ~130px for the title.
    <header className="md:h-16 border-b border-white/5 flex flex-wrap md:flex-nowrap items-center md:gap-3 px-4 md:px-8 bg-bg/95 backdrop-blur-md fixed top-0 right-0 left-0 md:left-64 z-20">
      {/* Left slot: may shrink, and a long title is cut with an ellipsis instead of wrapping under the avatar */}
      <div className="order-1 h-16 flex items-center min-w-0 flex-1 mr-3 md:mr-0 overflow-hidden [&_div]:min-w-0 [&_h1]:truncate">{left}</div>

      {/* Page-specific actions: after the title on desktop (before the common controls), a row of their own on a phone */}
      {actions && (
        <div
          data-testid="header-actions"
          className="order-3 md:order-2 w-full md:w-auto h-12 md:h-auto flex items-center gap-3 overflow-x-auto md:overflow-visible border-t border-white/5 md:border-0 text-ink-muted"
        >
          {actions}
          <div className="hidden md:block w-px h-5 bg-white/10 shrink-0" />
        </div>
      )}

      {/* Right side */}
      <div className="order-2 md:order-3 h-16 md:h-auto flex items-center gap-3 text-ink-muted shrink-0">
        <DemoBanner />

        {/* AI status pills — hidden on small screens */}
        <div className="hidden lg:flex items-center gap-3 pr-3 border-r border-white/10">
          {/* Ollama */}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              aiStatus === 'ok'    ? 'bg-green-500 animate-pulse' :
              aiStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
            }`} />
            <Brain size={12} className={aiStatus === 'ok' ? 'text-accent' : 'text-ink-muted'} />
            <span className={`text-[10px] font-bold font-mono ${
              aiStatus === 'ok' ? 'text-accent' : 'text-ink-muted'
            }`}>
              {aiStatus === 'ok' ? 'READY' : aiStatus === 'error' ? 'OFFLINE' : 'WAIT'}
            </span>
          </div>

          {/* Network */}
          <div className="flex items-center gap-1">
            {isOnline
              ? <Wifi size={12} className="text-green-400" />
              : <WifiOff size={12} className="text-orange-400" />}
            <span className={`text-[10px] font-bold font-mono ${isOnline ? 'text-green-400' : 'text-orange-400'}`}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {/* Enrichment progress */}
          {enrichment && enrichment.total > 0 && (
            <div className="flex items-center gap-1.5">
              {enrichment.pending === 0 ? (
                <>
                  <Check size={11} className="text-green-400" />
                  <span className="text-[10px] text-green-400 font-mono">{enrichment.total} classified</span>
                </>
              ) : (
                <>
                  <Sparkles size={11} className="text-accent animate-pulse" />
                  <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{ width: `${Math.round(((enrichment.total - enrichment.pending) / enrichment.total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-ink-muted font-mono">
                    {enrichment.total - enrichment.pending}/{enrichment.total}
                  </span>
                  {eta && (
                    <span className="text-[10px] text-accent font-bold font-mono">{eta}</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Settings */}
        <button
          onClick={() => navigate('/settings')}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors hover:text-ink"
          title="Settings"
        >
          <Settings size={20} />
        </button>

        {/* Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowProfile(p => !p)}
            className="w-9 h-9 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent font-bold text-sm hover:bg-accent/30 transition-colors"
            title="Profile"
          >
            {user?.email?.[0].toUpperCase() ?? 'U'}
          </button>
          {showProfile && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
              <div className="absolute right-0 top-full mt-2 w-60 bg-surface border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                    {user?.email?.[0].toUpperCase() ?? 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-muted uppercase tracking-widest font-bold mb-0.5">Signed in as</p>
                    <p className="text-sm text-ink font-medium truncate">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-ink-muted hover:text-red-400 hover:bg-white/5 transition-colors"
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

/** Drop this immediately after <AppHeader> to prevent content sliding under the fixed bar */
AppHeader.Spacer = function Spacer() {
  const actionsRow = useSyncExternalStore(subscribeRow, getRow)
  // 4rem bar, plus the 3rem phone-only actions row when the page has actions
  return <div className={`h-16 shrink-0 ${actionsRow ? 'max-md:h-28' : ''}`} />
}
