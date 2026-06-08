import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../lib/api'
import { useAiStatus } from './useAiStatus'

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/health/ollama') return Promise.resolve({ status: 'ok' })
    if (path === '/items/enrichment') return Promise.resolve({ pending: 0, total: 0 })
    return Promise.resolve({})
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useAiStatus — initial state', () => {
  it('starts with aiStatus=loading, isOnline=true, no enrichment', () => {
    const { result } = renderHook(() => useAiStatus())
    expect(result.current.aiStatus).toBe('loading')
    expect(result.current.isOnline).toBe(true)
    expect(result.current.enrichment).toBeNull()
    expect(result.current.eta).toBeNull()
    expect(result.current.rate).toBeNull()
  })
})

describe('useAiStatus — health polling', () => {
  it('sets aiStatus=ok when Ollama health check succeeds', async () => {
    const { result } = renderHook(() => useAiStatus())
    await waitFor(() => expect(result.current.aiStatus).toBe('ok'))
  })

  it('sets aiStatus=error when Ollama health check fails', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/health/ollama') return Promise.reject(new Error('offline'))
      return Promise.resolve({ pending: 0, total: 0 })
    })
    const { result } = renderHook(() => useAiStatus())
    await waitFor(() => expect(result.current.aiStatus).toBe('error'))
  })

  it('calls apiFetch /health/ollama on mount', async () => {
    renderHook(() => useAiStatus())
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/health/ollama')
    )
  })
})

describe('useAiStatus — enrichment data', () => {
  it('populates enrichment when total > 0', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/health/ollama') return Promise.resolve({ status: 'ok' })
      if (path === '/items/enrichment') return Promise.resolve({ pending: 4, total: 12 })
      return Promise.resolve({})
    })
    const { result } = renderHook(() => useAiStatus())
    await waitFor(() => expect(result.current.enrichment).not.toBeNull())
    expect(result.current.enrichment).toEqual({ pending: 4, total: 12 })
  })

  it('keeps enrichment=null when total===0', async () => {
    const { result } = renderHook(() => useAiStatus())
    await waitFor(() => expect(result.current.aiStatus).toBe('ok'))
    expect(result.current.enrichment).toBeNull()
  })

  it('calls apiFetch /items/enrichment on mount', async () => {
    renderHook(() => useAiStatus())
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/items/enrichment')
    )
  })
})

describe('useAiStatus — online/offline events', () => {
  it('sets isOnline=false on offline event', () => {
    const { result } = renderHook(() => useAiStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current.isOnline).toBe(false)
  })

  it('restores isOnline=true on online event', () => {
    const { result } = renderHook(() => useAiStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current.isOnline).toBe(true)
  })
})

describe('useAiStatus — interval polling', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('calls /health/ollama again after 30 seconds', async () => {
    renderHook(() => useAiStatus())
    // let initial call fire
    await act(async () => { await Promise.resolve() })
    const before = mockApiFetch.mock.calls.filter(c => c[0] === '/health/ollama').length
    await act(async () => { vi.advanceTimersByTime(30_000) })
    const after = mockApiFetch.mock.calls.filter(c => c[0] === '/health/ollama').length
    expect(after).toBeGreaterThan(before)
  })

  it('calls /items/enrichment again after 5 seconds', async () => {
    renderHook(() => useAiStatus())
    await act(async () => { await Promise.resolve() })
    const before = mockApiFetch.mock.calls.filter(c => c[0] === '/items/enrichment').length
    await act(async () => { vi.advanceTimersByTime(5_000) })
    const after = mockApiFetch.mock.calls.filter(c => c[0] === '/items/enrichment').length
    expect(after).toBeGreaterThan(before)
  })
})
