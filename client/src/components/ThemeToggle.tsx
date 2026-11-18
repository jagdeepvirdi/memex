import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemePref, type ThemePref } from '../lib/theme'

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<ThemePref, string> = { system: 'Theme: follow system', light: 'Theme: light', dark: 'Theme: dark' }
const ICON = { system: Monitor, light: Sun, dark: Moon }

/** One button that cycles system -> light -> dark. */
export function ThemeToggle() {
  const [pref, setPref] = useThemePref()
  const Icon = ICON[pref]
  return (
    <button
      type="button"
      onClick={() => setPref(NEXT[pref])}
      className="p-2 hover:bg-white/5 rounded-lg transition-colors hover:text-ink"
      title={`${LABEL[pref]} (click for ${NEXT[pref]})`}
      aria-label={`${LABEL[pref]}. Switch to ${NEXT[pref]}.`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  )
}
