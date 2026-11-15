import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, render, screen, fireEvent } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('react-router-dom', () => ({ Link: ({ children, to }: any) => <a href={to}>{children}</a> }))
vi.mock('../../lib/api', async orig => ({
  ...(await orig<typeof import('../../lib/api')>()),
  explainItem: vi.fn(),
  fetchIngestJob: vi.fn(),
  fetchItem: vi.fn(),
  fetchAiProviders: vi.fn().mockResolvedValue([]),
  fetchDerivedItems: vi.fn().mockResolvedValue([]),
  extractRecipeFromItem: vi.fn(),
}))

import { useExplainJob, describeExplainStage } from './useExplainJob'
import ItemAiActions from './ItemAiActions'
import { ApiError, explainItem, fetchIngestJob, fetchItem } from '../../lib/api'
import type { Item } from '../../../../shared/types'

const ITEM = { id: 'vid-1', title: 'Long video', type: 'link', content: 'x', structured: { videoId: 'dQw4w9WgXcQ' }, categories: [], tags: [], source: 'youtube', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', reviewed: false, createdAt: new Date(), updatedAt: new Date() } as Item
const processing = (over: Record<string, unknown> = {}) => ({ status: 'processing', progress: 29, total: 7, completed: 2, details: { itemId: 'vid-1', stage: 'summarising', part: 3, parts: 6 }, ...over })
const completed = { status: 'completed', progress: 100, total: 7, completed: 7, details: { itemId: 'vid-1' } }
const KEY = 'memex-explain-job:vid-1'

/** Lets the immediate poll and any pending promises settle without advancing the 1.5 s timer. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const tick = (ms = 1500) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  sessionStorage.clear()
  vi.mocked(explainItem).mockResolvedValue({ jobId: 'job-1' })
  vi.mocked(fetchItem).mockResolvedValue({ ...ITEM, structured: { explanation: { summary: 's' } } } as Item)
})
afterEach(() => vi.useRealTimers())

describe('describeExplainStage', () => {
  it.each([
    [{ stage: 'reading' }, 'Reading the transcript…'],
    [{ stage: 'summarising', part: 3, parts: 6 }, 'Summarising part 3 of 6…'],
    [{ stage: 'summarising' }, 'Summarising…'],
    [{ stage: 'writing' }, 'Writing the explanation…'],
    [undefined, 'Working…'],
  ])('%j → %s', (details, label) => {
    expect(describeExplainStage({ details } as never)).toBe(label)
  })
})

describe('useExplainJob', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    expect(result.current.run).toEqual({ running: false, percent: 0, label: '' })
    expect(fetchIngestJob).not.toHaveBeenCalled()
  })

  it('starts the job, remembers its id for this item, and shows progress as it is polled', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({ provider: 'ollama', force: false }) })
    await settle()

    expect(explainItem).toHaveBeenCalledWith('vid-1', { provider: 'ollama', force: false })
    expect(sessionStorage.getItem(KEY)).toBe('job-1')
    expect(result.current.run).toEqual({ running: true, percent: 29, label: 'Summarising part 3 of 6…' })

    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 57, details: { stage: 'summarising', part: 5, parts: 6 } }) as never)
    await tick()
    expect(result.current.run).toMatchObject({ percent: 57, label: 'Summarising part 5 of 6…' })
  })

  it('never shows an empty bar: at least 3 percent while running', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 0, details: { stage: 'reading' } }) as never)
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(result.current.run.percent).toBe(3)
  })

  it('when the job completes: stops polling, re-reads the item, hands it up, forgets the job and says so', async () => {
    const onDone = vi.fn()
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockResolvedValue(completed as never)
    const { result } = renderHook(() => useExplainJob('vid-1', onDone))
    await act(async () => { await result.current.start({}) })
    await settle()
    await tick()

    expect(fetchItem).toHaveBeenCalledWith('vid-1')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'vid-1' }))
    expect(toast.success).toHaveBeenCalledWith('Explanation saved')
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(result.current.run.running).toBe(false)

    const polls = vi.mocked(fetchIngestJob).mock.calls.length
    await tick(10_000)
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBe(polls) // stopped
  })

  it('when the job fails: shows the job message, forgets it and stops', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'failed', progress: 0, total: 1, completed: 0, error: 'No transcript is available for this video.' } as never)
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).toHaveBeenCalledWith('No transcript is available for this video.')
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(result.current.run.running).toBe(false)
    expect(fetchItem).not.toHaveBeenCalled()
  })

  it('a failed job without a message still tells the user', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'failed', progress: 0, total: 1, completed: 0 } as never)
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).toHaveBeenCalledWith('Failed to explain')
  })

  it('rejects with the server message when the job cannot be started (e.g. one is already running)', async () => {
    vi.mocked(explainItem).mockRejectedValue(new ApiError('Another explanation is still running. Wait for it to finish.', 409))
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await expect(result.current.start({})).rejects.toThrow('still running')
    expect(result.current.run.running).toBe(false)
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(fetchIngestJob).not.toHaveBeenCalled()
  })

  it('tolerates a few failed polls, then gives up with a clear message', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockRejectedValue(new Error('Failed to fetch'))
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    await tick(); await tick(); await tick()
    expect(result.current.run.running).toBe(true) // still trying
    expect(toast.error).not.toHaveBeenCalled()
    await tick(); await tick()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Lost contact with the server/))
    expect(result.current.run.running).toBe(false)
  })

  it('a poll failure followed by success does not accumulate toward giving up', async () => {
    vi.mocked(fetchIngestJob)
      .mockRejectedValueOnce(new Error('blip')).mockRejectedValueOnce(new Error('blip')).mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce(processing() as never)
      .mockRejectedValueOnce(new Error('blip')).mockRejectedValueOnce(new Error('blip')).mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue(completed as never)
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    for (let i = 0; i < 8; i++) await tick()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Explanation saved')
  })

  it('quietly drops a job that no longer exists (server restarted)', async () => {
    vi.mocked(fetchIngestJob).mockRejectedValue(new Error('Job not found'))
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.run.running).toBe(false)
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('tells the user if the explanation finished but the item could not be reloaded', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(completed as never)
    vi.mocked(fetchItem).mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/finished, but the item could not be reloaded/))
  })

  it('resumes a job it started earlier when the page is opened again', async () => {
    sessionStorage.setItem(KEY, 'job-77')
    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 71, details: { stage: 'writing' } }) as never)
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await settle()
    expect(fetchIngestJob).toHaveBeenCalledWith('job-77')
    expect(explainItem).not.toHaveBeenCalled()
    expect(result.current.run).toEqual({ running: true, percent: 71, label: 'Writing the explanation…' })
  })

  it('shows a result that finished while the user was away', async () => {
    sessionStorage.setItem(KEY, 'job-77')
    vi.mocked(fetchIngestJob).mockResolvedValue(completed as never)
    const onDone = vi.fn()
    renderHook(() => useExplainJob('vid-1', onDone))
    await settle()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('stops polling when the page is left, but keeps the job id so it can be resumed', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result, unmount } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await act(async () => { await result.current.start({}) })
    await settle()
    unmount()
    const polls = vi.mocked(fetchIngestJob).mock.calls.length
    await tick(10_000)
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBe(polls)
    expect(sessionStorage.getItem(KEY)).toBe('job-1')
  })

  it('does not carry a job from one item to the next', async () => {
    sessionStorage.setItem('memex-explain-job:other', 'job-other')
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = renderHook(() => useExplainJob('vid-1', vi.fn()))
    await settle()
    expect(fetchIngestJob).not.toHaveBeenCalled()
    expect(result.current.run.running).toBe(false)
  })
})

describe('ItemAiActions — explain progress UI', () => {
  // waitFor/findBy need the clock to move on its own; the 1.5 s poll is still advanced by tick().
  beforeEach(() => { vi.useRealTimers(); vi.useFakeTimers({ shouldAdvanceTime: true }) })

  it('shows a progress bar and the current step while explaining, and disables the buttons', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Explaining' })).toHaveAttribute('aria-valuenow', '29'))
    const bar = screen.getByRole('progressbar', { name: 'Explaining' })
    expect(bar).toHaveAttribute('aria-valuenow', '29')
    expect(screen.getByTestId('explain-progress')).toHaveTextContent('Summarising part 3 of 6…')
    expect(screen.getByTestId('explain-progress')).toHaveTextContent('You can leave this page')
    expect(screen.getByRole('button', { name: /explaining/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /extract recipe/i })).toBeDisabled()
  })

  it('removes the progress bar when it finishes', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockResolvedValue(completed as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument())
    await tick()
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })

  it('picks up a running job on load and shows its progress straight away', async () => {
    sessionStorage.setItem(KEY, 'job-5')
    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 43, details: { stage: 'summarising', part: 4, parts: 6 } }) as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43'))
    expect(screen.getByTestId('explain-progress')).toHaveTextContent('Summarising part 4 of 6…')
  })

  it('shows the server message when starting is refused, and no progress bar', async () => {
    vi.mocked(explainItem).mockRejectedValue(new ApiError('Another explanation is still running. Wait for it to finish.', 409))
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Another explanation is still running. Wait for it to finish.'))
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
