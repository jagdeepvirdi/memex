import { Cpu, ShieldCheck, Library, Lock, Bookmark, Palette } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type SettingsTabId = 'ai' | 'privacy' | 'library' | 'vault' | 'capture' | 'appearance'

export interface SettingsTabDef {
  id: SettingsTabId
  label: string
  /** One line under the label in the nav, so each section says what lives in it. */
  hint: string
  icon: LucideIcon
}

export const SETTINGS_TABS: readonly SettingsTabDef[] = [
  { id: 'ai', label: 'AI', hint: 'Provider and model', icon: Cpu },
  { id: 'privacy', label: 'Keys & Privacy', hint: 'API keys, Strict Local Mode', icon: ShieldCheck },
  { id: 'library', label: 'Library', hint: 'Categories, import and export', icon: Library },
  { id: 'vault', label: 'Vault', hint: 'Auto-lock, password, reset', icon: Lock },
  { id: 'capture', label: 'Capture', hint: 'Bookmarklet, AI assistants, YouTube', icon: Bookmark },
  { id: 'appearance', label: 'Appearance', hint: 'Theme: system, light, dark', icon: Palette },
]

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'ai'

/** Maps the `/settings/:tab` URL segment to a tab; anything unknown falls back to the first tab. */
export function resolveSettingsTab(param: string | undefined): SettingsTabId {
  return SETTINGS_TABS.find(t => t.id === param)?.id ?? DEFAULT_SETTINGS_TAB
}

export const settingsTabPath = (id: SettingsTabId) => `/settings/${id}`

export interface Notify {
  success: (message: string, ms?: number) => void
  error: (message: string, ms?: number) => void
}

/** What every tab receives from the Settings shell. */
export interface SettingsTabProps {
  settings: Record<string, any>
  onUpdate: (patch: Record<string, any>) => void | Promise<void>
  notify: Notify
}
