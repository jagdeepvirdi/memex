import { useState, type ReactNode } from 'react'
import { Settings, LogOut, Brain, Check, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAiStatus } from '../hooks/useAiStatus'

interface Props {
  /** Left side — search bar (Dashboard) or back-button + title (all other pages) */
  left: ReactNode
  /** Page-specific right-side actions rendered before the common controls */
  actions?: ReactNode
}

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

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-bg/95 backdrop-blur-md fixed top-0 right-0 left-64 z-20">
      {/* Left slot */}
      <div className="flex items-center min-w-0">{left}</div>

      {/* Right side */}
      <div className="flex items-center gap-3 text-ink-muted shrink-0">
        {/* Page-specific actions */}
        {actions && (
          <>
            {actions}
            <div className="w-px h-5 bg-white/10" />
          </>
        )}

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
  return <div className="h-16 shrink-0" />
}
