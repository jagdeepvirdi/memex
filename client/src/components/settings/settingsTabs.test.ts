import { describe, it, expect } from 'vitest'
import { SETTINGS_TABS, DEFAULT_SETTINGS_TAB, resolveSettingsTab, settingsTabPath } from './settingsTabs'

describe('settings tabs', () => {
  it('defines the five sections in order', () => {
    expect(SETTINGS_TABS.map(t => t.id)).toEqual(['ai', 'privacy', 'library', 'vault', 'capture'])
  })

  it('gives every section a label and a hint, and no duplicate ids', () => {
    for (const t of SETTINGS_TABS) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.hint.length).toBeGreaterThan(0)
    }
    expect(new Set(SETTINGS_TABS.map(t => t.id)).size).toBe(SETTINGS_TABS.length)
  })

  it('resolves a URL segment to its tab', () => {
    for (const t of SETTINGS_TABS) expect(resolveSettingsTab(t.id)).toBe(t.id)
  })

  it('falls back to the default for a missing or unknown segment', () => {
    expect(DEFAULT_SETTINGS_TAB).toBe('ai')
    expect(resolveSettingsTab(undefined)).toBe('ai')
    expect(resolveSettingsTab('')).toBe('ai')
    expect(resolveSettingsTab('nope')).toBe('ai')
    expect(resolveSettingsTab('AI')).toBe('ai') // ids are lower-case; anything else is unknown
  })

  it('builds the path the router matches', () => {
    expect(settingsTabPath('privacy')).toBe('/settings/privacy')
  })
})
