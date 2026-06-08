import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
})

describe('authStore — initial state', () => {
  it('starts unauthenticated with no user or token', () => {
    const { user, token, isAuthenticated } = useAuthStore.getState()
    expect(user).toBeNull()
    expect(token).toBeNull()
    expect(isAuthenticated).toBe(false)
  })
})

describe('authStore — login', () => {
  it('sets user, token, and isAuthenticated on login', () => {
    const user = { id: 'u1', email: 'test@example.com' }
    useAuthStore.getState().login(user, 'tok-abc')
    const state = useAuthStore.getState()
    expect(state.user).toEqual(user)
    expect(state.token).toBe('tok-abc')
    expect(state.isAuthenticated).toBe(true)
  })

  it('overwrites a previous session on re-login', () => {
    useAuthStore.getState().login({ id: 'old', email: 'old@x.com' }, 'old-tok')
    useAuthStore.getState().login({ id: 'new', email: 'new@x.com' }, 'new-tok')
    const state = useAuthStore.getState()
    expect(state.token).toBe('new-tok')
    expect(state.user?.email).toBe('new@x.com')
  })
})

describe('authStore — logout', () => {
  it('clears user, token, and sets isAuthenticated=false', () => {
    useAuthStore.getState().login({ id: 'u1', email: 'a@b.com' }, 'tok-xyz')
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('is idempotent when already logged out', () => {
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
  })
})
