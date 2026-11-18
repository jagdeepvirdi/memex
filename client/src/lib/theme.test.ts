import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getThemePref, resolveTheme, applyTheme, setThemePref } from './theme'

const mockSystem = (light: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('light') ? light : !light,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />'
    mockSystem(false)
  })

  it('defaults to following the system, and a saved choice wins', () => {
    expect(getThemePref()).toBe('system')
    expect(resolveTheme()).toBe('dark')
    mockSystem(true)
    expect(resolveTheme()).toBe('light')
    localStorage.setItem('memex-theme', 'dark')
    expect(getThemePref()).toBe('dark')
    expect(resolveTheme()).toBe('dark')
  })

  it('ignores a junk saved value', () => {
    localStorage.setItem('memex-theme', 'purple')
    expect(getThemePref()).toBe('system')
  })

  it('writes data-theme and the browser theme-color when applied', () => {
    setThemePref('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#F5F7FB')
    expect(localStorage.getItem('memex-theme')).toBe('light')
    setThemePref('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0B0E14')
  })

  it('"system" clears the saved choice and follows the system setting', () => {
    setThemePref('dark')
    mockSystem(true)
    setThemePref('system')
    expect(localStorage.getItem('memex-theme')).toBeNull()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('still works when storage throws (private window)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(getThemePref()).toBe('system')
    expect(applyTheme()).toBe('dark')
    spy.mockRestore()
  })
})
