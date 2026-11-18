/**
 * Light / dark / follow-the-system theme.
 *
 * The choice is saved in localStorage ('memex-theme'); the resolved theme is written to <html data-theme="...">, which
 * the CSS variables in index.css key off. index.html runs the same resolution before first paint so there is no flash.
 */
import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'memex-theme'
const META_COLOR: Record<ResolvedTheme, string> = { dark: '#0B0E14', light: '#F5F7FB' }

const listeners = new Set<() => void>()
// Bumped on every change so a hook re-renders even when only the saved preference changed (system -> dark while the
// system already is dark leaves the resolved theme the same).
let version = 0
const emit = () => { version++; listeners.forEach(l => l()) }

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(pref: ThemePref = getThemePref()): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref
}

/** Writes the resolved theme to <html> (and the browser's theme-color) and tells subscribers. */
export function applyTheme(pref: ThemePref = getThemePref()): ResolvedTheme {
  const resolved = resolveTheme(pref)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[resolved])
  }
  emit()
  return resolved
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* private window / blocked storage: the choice just lasts until reload */
  }
  applyTheme(pref)
}

/** Follow the system setting while the preference is 'system'. Call once at startup. */
export function initTheme(): void {
  applyTheme()
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (getThemePref() === 'system') applyTheme('system')
  })
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') as ResolvedTheme

/** The theme in effect right now, re-rendering when it changes (for canvas colours and the toast theme). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, snapshot, () => 'dark')
}

/** [saved preference, setter] for the toggle. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  useSyncExternalStore(subscribe, () => version, () => 0)
  return [getThemePref(), setThemePref]
}
