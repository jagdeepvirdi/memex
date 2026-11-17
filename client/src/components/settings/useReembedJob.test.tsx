import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('../../lib/api', async orig => ({
  ...(await orig<typeof import('../../lib/api')>()),
  fetchIngestJob: vi.fn(),
  cancelIngestJob: vi.fn(),
}))

import { useReembedJob, describeReembedProgress, describeReembedOutcome } from './useReembedJob'
import { ApiError, cancelIngestJob, fetchIngestJob } from '../../lib/api'

const processing = (over: Record<string, unknown> = {}) => ({
  status: 'processing', progress: 40, completed: 40, total: 100, details: { stage: 'items', embedded: 40, skippedPrivate: 0, failures: 0 }, ...over,
})
const finished = (status: string, details: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  status, progress: 100, completed: 100, total: 100, details: { stage: 'items', embedded: 98, skippedPrivate: 2, failures: 0, ...details }, ...extra,
})

const onFinished = vi.fn()
const setup = () => renderHook(() => useReembedJob(onFinished))
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const tick = (ms = 1500) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.mocked(cancelIngestJob).mockResolvedValue({ status: 'cancelling' })
})
afterEach(() => vi.useRealTimers())

describe('describeReembedProgress', () => {
  it.each([
    [{ completed: 120, total: 657, details: { stage: 'items' } }, 'Embedding items: 120 of 657'],
    [{ completed: 3, total: 12, details: { stage: 'entities' } }, 'Embedding names: 3 of 12'],
    [{ completed: 0, total: 0, details: undefined }, 'Starting…'],
  ] as const)('%j → %s', (job, label) => {
    expect(describeReembedProgress(job as never)).toBe(label)
  })
})

describe('describeReembedOutcome', () => {
  it('says what was embedded, kept private, and not embedded', () => {
    expect(describeReembedOutcome({ details: { embedded: 98, skippedPrivate: 2, failures: 3 } } as never))
      .toBe('98 embedded, 2 private kept on this machine, 3 could not be embedded (run it again to retry)')
  })
  it('leaves out what is zero', () => {
    expect(describeReembedOutcome({ details: { embedded: 5, skippedPrivate: 0, failures: 0 } } as never)).toBe('5 embedded')
  })
  it('copes with missing details', () => {
    expect(describeReembedOutcome({ details: undefined } as never)).toBe('0 embedded')
  })
})

describe('useReembedJob', () => {
  it('starts idle and polls nothing', () => {
    const { result } = setup()
    expect(result.current.run).toEqual({ running: false, percent: 0, label: '', cancelling: false })
    expect(fetchIngestJob).not.toHaveBeenCalled()
  })

  it('follows a job: shows progress and keeps polling while it processes', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    expect(result.current.run).toMatchObject({ running: true, percent: 40, label: 'Embedding items: 40 of 100', cancelling: false })
    await tick()
    await tick()
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(onFinished).not.toHaveBeenCalled()
  })

  it('on completion: reports what happened, stops polling and tells the caller', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockResolvedValue(finished('completed') as never)
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    await tick()
    expect(result.current.run.running).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Re-embedding finished: 98 embedded, 2 private kept on this machine')
    expect(onFinished).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(fetchIngestJob).mock.calls.length
    await tick(5000)
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBe(calls) // no more polling
  })

  it('on failure: shows the server message', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(finished('failed', {}, { error: 'No API key is configured for gemini' }) as never)
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    expect(toast.error).toHaveBeenCalledWith('No API key is configured for gemini')
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(result.current.run.running).toBe(false)
  })

  it('on failure without a message: says it failed', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(finished('failed') as never)
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    expect(toast.error).toHaveBeenCalledWith('Re-embedding failed')
  })

  it('on cancel: says it can be resumed, without an error', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(finished('cancelled', { embedded: 30, skippedPrivate: 0 }) as never)
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.message).toHaveBeenCalledWith(expect.stringMatching(/cancelled.*30 embedded.*resumed/))
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('Cancel asks the server to stop and switches the label at once', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    await act(async () => { await result.current.cancel() })
    expect(cancelIngestJob).toHaveBeenCalledWith('job-1')
    expect(result.current.run).toMatchObject({ cancelling: true, label: 'Cancelling…' })
  })

  it('Cancel twice only asks once', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    await act(async () => { await result.current.cancel() })
    await act(async () => { await result.current.cancel() })
    expect(cancelIngestJob).toHaveBeenCalledTimes(1)
  })

  it('a job that finished before Cancel arrived shows its real result (409)', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockResolvedValue(finished('completed') as never)
    vi.mocked(cancelIngestJob).mockRejectedValueOnce(new ApiError('This job has already finished.', 409))
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    await act(async () => { await result.current.cancel() })
    await settle()
    expect(toast.success).toHaveBeenCalled()
    expect(result.current.run.running).toBe(false)
  })

  it('a Cancel that cannot reach the server keeps following the job and says so', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    vi.mocked(cancelIngestJob).mockRejectedValueOnce(new Error('offline'))
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    await act(async () => { await result.current.cancel() })
    expect(toast.error).toHaveBeenCalledWith('offline')
    expect(result.current.run).toMatchObject({ running: true, cancelling: false })
  })

  it('a job that no longer exists ends quietly', async () => {
    vi.mocked(fetchIngestJob).mockRejectedValue(new Error('Job not found'))
    const { result } = setup()
    act(() => result.current.follow('gone'))
    await settle()
    expect(result.current.run.running).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('gives up with a message after repeated failures to read the job', async () => {
    vi.mocked(fetchIngestJob).mockRejectedValue(new Error('network down'))
    const { result } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    for (let i = 0; i < 6; i++) await tick()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Lost contact/))
    expect(result.current.run.running).toBe(false)
  })

  it('stops polling when the component goes away', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result, unmount } = setup()
    act(() => result.current.follow('job-1'))
    await settle()
    unmount()
    const calls = vi.mocked(fetchIngestJob).mock.calls.length
    await tick(6000)
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBe(calls)
  })
})
