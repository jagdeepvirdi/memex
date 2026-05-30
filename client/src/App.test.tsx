import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

// ── Mocks — must precede all imports from the module graph ────────────────────

vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: any) => children,
  Routes: () => null,
  Route: () => null,
  Navigate: () => null,
}))

vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => children,
}))

vi.mock('./pages/Dashboard', () => ({ default: () => null }))
vi.mock('./pages/Category', () => ({ default: () => null }))
vi.mock('./pages/Item', () => ({ default: () => null }))
vi.mock('./pages/Vault', () => ({ default: () => null }))
vi.mock('./pages/Settings', () => ({ default: () => null }))
vi.mock('./pages/Login', () => ({ default: () => null }))
vi.mock('./pages/Trash', () => ({ default: () => null }))
vi.mock('./pages/PendingItems', () => ({ default: () => null }))
vi.mock('./pages/EnrichedItems', () => ({ default: () => null }))
vi.mock('./pages/TableView', () => ({ default: () => null }))
vi.mock('./pages/PlacesView', () => ({ default: () => null }))
vi.mock('./pages/MediaView', () => ({ default: () => null }))
vi.mock('./pages/SemanticGraph', () => ({ default: () => null }))
vi.mock('./pages/Welcome', () => ({ default: () => null }))
vi.mock('./pages/AskMemex', () => ({ default: () => null }))
vi.mock('./pages/CategoryReview', () => ({ default: () => null }))
vi.mock('./pages/Digest', () => ({ default: () => null }))
vi.mock('./pages/PublicItem', () => ({ default: () => null }))

// isAuthenticated is read by the mock at call-time via closure
let _isAuthenticated = true
vi.mock('./store/authStore', () => ({
  useAuthStore: (selector: any) =>
    selector({ isAuthenticated: _isAuthenticated, token: 'tok', logout: vi.fn() }),
}))

const mockFetchDueReminders = vi.fn()
const mockSetReminder = vi.fn()
vi.mock('./lib/api', () => ({
  fetchDueReminders: (...a: any[]) => mockFetchDueReminders(...a),
  setReminder: (...a: any[]) => mockSetReminder(...a),
}))

import App from './App'

// ── ReminderPoller ────────────────────────────────────────────────────────────

describe('ReminderPoller', () => {
  beforeEach(() => {
    _isAuthenticated = true
    vi.useFakeTimers()
    mockFetchDueReminders.mockResolvedValue([])
    mockSetReminder.mockResolvedValue({})

    Object.defineProperty(window, 'Notification', {
      value: class {
        static permission = 'granted'
        static requestPermission = vi.fn().mockResolvedValue('granted')
        onclick: (() => void) | null = null
        constructor(public title: string, public options?: any) {}
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('calls fetchDueReminders on mount when authenticated', async () => {
    await act(async () => { render(<App />) })
    expect(mockFetchDueReminders).toHaveBeenCalled()
  })

  it('does not call fetchDueReminders when not authenticated', async () => {
    _isAuthenticated = false
    await act(async () => { render(<App />) })
    expect(mockFetchDueReminders).not.toHaveBeenCalled()
  })

  it('clears remindAt for due items', async () => {
    mockFetchDueReminders.mockResolvedValueOnce([{ id: 'item-1', title: 'Buy milk' }])
    await act(async () => { render(<App />) })
    expect(mockSetReminder).toHaveBeenCalledWith('item-1', null)
  })

  it('polls again after 60 seconds', async () => {
    await act(async () => { render(<App />) })
    const count = mockFetchDueReminders.mock.calls.length
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(mockFetchDueReminders.mock.calls.length).toBeGreaterThan(count)
  })
})

// ── MondayDigestRedirect ──────────────────────────────────────────────────────

describe('MondayDigestRedirect', () => {
  beforeEach(() => {
    _isAuthenticated = true
    vi.useFakeTimers()
    mockFetchDueReminders.mockResolvedValue([])
    localStorage.clear()

    Object.defineProperty(window, 'Notification', {
      value: class {
        static permission = 'default'
        static requestPermission = vi.fn().mockResolvedValue('default')
        constructor() {}
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('does not redirect on a non-Monday (Tuesday)', async () => {
    vi.setSystemTime(new Date('2025-01-07')) // Tuesday
    await act(async () => { render(<App />) })
    act(() => { vi.advanceTimersByTime(600) })
    expect(window.location.href).not.toBe('/digest')
  })

  it('redirects to /digest on Monday when not already seen today', async () => {
    vi.setSystemTime(new Date('2025-01-06')) // Monday
    // Render first so useEffect fires and registers the setTimeout
    await act(async () => { render(<App />) })
    // Now advance past the 500ms delay
    act(() => { vi.advanceTimersByTime(600) })
    expect(window.location.href).toBe('/digest')
  })

  it('does not redirect a second time on the same Monday', async () => {
    const monday = new Date('2025-01-06')
    vi.setSystemTime(monday)
    const key = `memex-digest-seen-${monday.toISOString().split('T')[0]}`
    localStorage.setItem(key, '1')
    await act(async () => { render(<App />) })
    act(() => { vi.advanceTimersByTime(600) })
    expect(window.location.href).not.toBe('/digest')
  })

  it('does not redirect when not authenticated', async () => {
    _isAuthenticated = false
    vi.setSystemTime(new Date('2025-01-06')) // Monday
    await act(async () => { render(<App />) })
    act(() => { vi.advanceTimersByTime(600) })
    expect(window.location.href).not.toBe('/digest')
  })
})
