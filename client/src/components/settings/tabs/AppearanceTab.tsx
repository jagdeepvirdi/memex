import { Palette, Monitor, Sun, Moon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SettingsSection } from '../SettingsSection'
import { useThemePref, type ThemePref } from '../../../lib/theme'

const OPTIONS: ReadonlyArray<{ id: ThemePref; label: string; hint: string; icon: LucideIcon }> = [
  { id: 'system', label: 'System', hint: 'Match your device: light by day, dark by night if it switches.', icon: Monitor },
  { id: 'light', label: 'Light', hint: 'Daylight: bright surfaces, deep ink text.', icon: Sun },
  { id: 'dark', label: 'Dark', hint: 'Midnight: dark surfaces, easy on the eyes at night.', icon: Moon },
]

/** Light, dark, or follow the system. The choice is saved in this browser only (it is not a server setting). */
export function AppearanceTab() {
  const [pref, setPref] = useThemePref()

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        icon={<Palette size={20} className="text-accent" />}
        title="Theme"
        description="Choose how Memex looks. It is remembered on this device and browser."
      >
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPTIONS.map(o => {
            const Icon = o.icon
            const selected = pref === o.id
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPref(o.id)}
                className={`flex flex-col items-start gap-2 text-left rounded-xl border p-4 transition-colors ${
                  selected
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5 text-ink-muted'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon size={16} className={selected ? 'text-accent' : ''} aria-hidden="true" />
                  {o.label}
                </span>
                <span className="text-xs text-ink-muted">{o.hint}</span>
              </button>
            )
          })}
        </div>
      </SettingsSection>
    </div>
  )
}
