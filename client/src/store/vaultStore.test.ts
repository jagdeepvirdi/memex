import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useVaultStore } from './vaultStore'

beforeEach(() => {
  // Reset store to locked state before each test
  useVaultStore.setState({ isLocked: true, vaultKey: null, lastActivity: Date.now() })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const fakeKey = { type: 'secret', algorithm: { name: 'AES-GCM' } } as unknown as CryptoKey

describe('vaultStore — unlock / lock', () => {
  it('starts locked with no key', () => {
    const { isLocked, vaultKey } = useVaultStore.getState()
    expect(isLocked).toBe(true)
    expect(vaultKey).toBeNull()
  })

  it('unlock sets isLocked=false and stores the key', () => {
    useVaultStore.getState().unlock(fakeKey)
    const state = useVaultStore.getState()
    expect(state.isLocked).toBe(false)
    expect(state.vaultKey).toBe(fakeKey)
  })

  it('lock sets isLocked=true and clears the key', () => {
    useVaultStore.getState().unlock(fakeKey)
    useVaultStore.getState().lock()
    const state = useVaultStore.getState()
    expect(state.isLocked).toBe(true)
    expect(state.vaultKey).toBeNull()
  })

  it('unlock updates lastActivity timestamp', () => {
    const before = Date.now()
    vi.advanceTimersByTime(1000)
    useVaultStore.getState().unlock(fakeKey)
    const { lastActivity } = useVaultStore.getState()
    expect(lastActivity).toBeGreaterThanOrEqual(before + 1000)
  })
})

describe('vaultStore — updateActivity', () => {
  it('updates lastActivity to now', () => {
    useVaultStore.getState().unlock(fakeKey)
    vi.advanceTimersByTime(5000)
    useVaultStore.getState().updateActivity()
    const { lastActivity } = useVaultStore.getState()
    expect(lastActivity).toBeGreaterThanOrEqual(Date.now())
  })
})

describe('vaultStore — checkAutoLock', () => {
  it('does not lock when vault is already locked', () => {
    // already locked — checkAutoLock should be a no-op
    useVaultStore.getState().checkAutoLock()
    expect(useVaultStore.getState().isLocked).toBe(true)
  })

  it('does not lock when activity is recent (< 15 min)', () => {
    useVaultStore.getState().unlock(fakeKey)
    vi.advanceTimersByTime(5 * 60 * 1000) // 5 minutes
    useVaultStore.getState().checkAutoLock()
    expect(useVaultStore.getState().isLocked).toBe(false)
  })

  it('locks automatically after 15 minutes of inactivity', () => {
    useVaultStore.getState().unlock(fakeKey)
    vi.advanceTimersByTime(15 * 60 * 1000 + 1) // 15 min + 1 ms
    useVaultStore.getState().checkAutoLock()
    expect(useVaultStore.getState().isLocked).toBe(true)
    expect(useVaultStore.getState().vaultKey).toBeNull()
  })

  it('does not lock when activity was recent even after long time', () => {
    useVaultStore.getState().unlock(fakeKey)
    vi.advanceTimersByTime(10 * 60 * 1000) // 10 minutes
    useVaultStore.getState().updateActivity()
    vi.advanceTimersByTime(10 * 60 * 1000) // another 10 min (20 total, but 10 since last activity)
    useVaultStore.getState().checkAutoLock()
    expect(useVaultStore.getState().isLocked).toBe(false)
  })
})
