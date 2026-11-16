import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Settings as SettingsIcon, Check, AlertCircle } from 'lucide-react'
import Sidebar from '../components/sidebar/Sidebar'
import { AppHeader } from '../components/AppHeader'
import { apiFetch } from '../lib/api'
import { SetupStatus } from '../components/settings/SetupStatus'
import { AiTab } from '../components/settings/tabs/AiTab'
import { KeysPrivacyTab } from '../components/settings/tabs/KeysPrivacyTab'
import { LibraryTab } from '../components/settings/tabs/LibraryTab'
import { VaultTab } from '../components/settings/tabs/VaultTab'
import { CaptureTab } from '../components/settings/tabs/CaptureTab'
import {
  SETTINGS_TABS,
  resolveSettingsTab,
  settingsTabPath,
} from '../components/settings/settingsTabs'
import type { Notify } from '../components/settings/settingsTabs'

type Toast = { kind: 'success' | 'error'; message: string }

/**
 * Settings shell: one section at a time, chosen by the URL (`/settings/:tab`). The shell owns what the sections
 * share (the settings object, saving it, and the toast), so switching sections never re-fetches or loses a change.
 */
export default function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>()
  const active = resolveSettingsTab(tab)

  const [settings, setSettings] = useState<Record<string, any>>({
    ai_model: 'llama3.2',
    use_claude: false,
    auto_lock_timeout: '15',
  })
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    apiFetch<Record<string, any>>('/settings').then(setSettings).catch(console.error)
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [])

  const notify = useMemo<Notify>(() => {
    const show = (kind: Toast['kind'], message: string, ms: number) => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setToast({ kind, message })
      toastTimer.current = setTimeout(() => setToast(null), ms)
    }
    return {
      success: (message, ms = 2000) => show('success', message, ms),
      error: (message, ms = 3000) => show('error', message, ms),
    }
  }, [])

  const handleUpdateSettings = async (patch: Record<string, any>) => {
    const previous = settings
    setSettings({ ...settings, ...patch })
    try {
      await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(patch) })
      notify.success('Settings saved')
    } catch {
      setSettings(previous) // roll back the optimistic update
      notify.error('Failed to save settings')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar activeSection="settings" />

      <main className="flex-1 flex flex-col relative overflow-y-auto">
        <AppHeader
          left={
            <div className="flex items-center gap-6">
              <Link to="/" className="text-ink-muted hover:text-ink transition-colors"><ArrowLeft size={20} /></Link>
              <div className="flex items-center gap-3">
                <SettingsIcon size={20} className="text-accent" />
                <h1 className="font-display text-lg text-ink">System Settings</h1>
              </div>
            </div>
          }
        />
        <AppHeader.Spacer />

        <div className="px-4 py-8 md:p-12 max-w-5xl mx-auto w-full flex flex-col gap-8">
          {/* Re-mounted per section so the strip re-reads provider status after, say, a key was saved. */}
          <SetupStatus key={active} settings={settings} />

          <div className="flex flex-col md:flex-row gap-8 md:gap-12">
            <nav aria-label="Settings sections" className="md:w-56 shrink-0">
              <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 md:sticky md:top-28">
                {SETTINGS_TABS.map(t => {
                  const Icon = t.icon
                  const isActive = t.id === active
                  return (
                    <li key={t.id} className="shrink-0">
                      <Link
                        to={settingsTabPath(t.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                          isActive ? 'bg-white/10 text-ink' : 'text-ink-muted hover:text-ink hover:bg-white/5'
                        }`}
                      >
                        <Icon size={16} className={isActive ? 'text-accent' : ''} aria-hidden="true" />
                        <span className="flex flex-col leading-tight">
                          <span className="text-sm font-medium">{t.label}</span>
                          <span className="hidden md:block text-[11px] text-ink-muted font-normal">{t.hint}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="flex-1 min-w-0 max-w-3xl" data-testid={`settings-tab-${active}`}>
              {active === 'ai' && <AiTab settings={settings} onUpdate={handleUpdateSettings} />}
              {active === 'privacy' && <KeysPrivacyTab settings={settings} onUpdate={handleUpdateSettings} />}
              {active === 'library' && <LibraryTab notify={notify} />}
              {active === 'vault' && <VaultTab settings={settings} onUpdate={handleUpdateSettings} notify={notify} />}
              {active === 'capture' && <CaptureTab settings={settings} />}
            </div>
          </div>
        </div>

        {toast && (
          <div
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={`fixed bottom-8 right-8 z-40 p-4 rounded-xl border flex items-center gap-3 shadow-2xl animate-in slide-in-from-right-4 duration-300 ${
              toast.kind === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}
          >
            {toast.kind === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        )}
      </main>
    </div>
  )
}
