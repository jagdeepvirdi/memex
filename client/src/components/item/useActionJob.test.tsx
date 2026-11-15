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

import { useActionJob, describeJobStage, type ActionJobKind } from './useActionJob'
import ItemAiActions from './ItemAiActions'
import { ApiError, explainItem, extractRecipeFromItem, fetchIngestJob, fetchItem } from '../../lib/api'
import type { Item } from '../../../../shared/types'

const ITEM = { id: 'vid-1', title: 'Long video', type: 'link', content: 'x', structured: { videoId: 'dQw4w9WgXcQ' }, categories: [], tags: [], source: 'youtube', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', reviewed: false, createdAt: new Date(), updatedAt: new Date() } as Item
const processing = (over: Record<string, unknown> = {}) => ({ status: 'processing', progress: 29, total: 7, completed: 2, details: { itemId: 'vid-1', stage: 'summarising', part: 3, parts: 6 }, ...over })
const completed = { status: 'completed', progress: 100, total: 7, completed: 7, details: { itemId: 'vid-1' } }
const keyFor = (kind: ActionJobKind) => `memex-job:${kind}:vid-1`

const launch = vi.fn()
const onCompleted = vi.fn()
const setup = (kind: ActionJobKind = 'explain', itemId = 'vid-1') =>
  renderHook(({ id, k }) => useActionJob({ itemId: id, kind: k, launch, onCompleted }), { initialProps: { id: itemId, k: kind } })

/** Lets the immediate poll and any pending promises settle without advancing the 1.5 s timer. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const tick = (ms = 1500) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  sessionStorage.clear()
  launch.mockReset().mockResolvedValue({ jobId: 'job-1' })
  onCompleted.mockReset().mockResolvedValue(undefined)
  vi.mocked(explainItem).mockResolvedValue({ jobId: 'job-1' })
  vi.mocked(fetchItem).mockResolvedValue({ ...ITEM, structured: { explanation: { summary: 's' } } } as Item)
})
afterEach(() => vi.useRealTimers())

describe('describeJobStage', () => {
  it.each([
    ['explain', { stage: 'reading' }, 'Reading the transcript…'],
    ['explain', { stage: 'summarising', part: 3, parts: 6 }, 'Summarising part 3 of 6…'],
    ['explain', { stage: 'summarising' }, 'Summarising…'],
    ['explain', { stage: 'writing' }, 'Writing the explanation…'],
    ['explain', undefined, 'Working…'],
    ['explain', { stage: 'checking' }, 'Working…'], // a stage from the other kind is not misread
    ['extract-recipe', { stage: 'reading' }, 'Reading the transcript…'],
    ['extract-recipe', { stage: 'checking' }, 'Checking it is a recipe…'],
    ['extract-recipe', { stage: 'extracting' }, 'Extracting the recipe…'],
    ['extract-recipe', undefined, 'Working…'],
    ['extract-recipe', { stage: 'writing' }, 'Working…'],
  ] as const)('%s %j → %s', (kind, details, label) => {
    expect(describeJobStage(kind, { details } as never)).toBe(label)
  })
})

describe('useActionJob', () => {
  it('starts idle and polls nothing', () => {
    const { result } = setup()
    expect(result.current.run).toEqual({ running: false, percent: 0, label: '' })
    expect(fetchIngestJob).not.toHaveBeenCalled()
  })

  it('launches with the given options, remembers the job id for this action and item, and shows progress as it is polled', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = setup()
    await act(async () => { await result.current.start({ provider: 'ollama', force: false }) })
    await settle()

    expect(launch).toHaveBeenCalledWith({ provider: 'ollama', force: false })
    expect(sessionStorage.getItem(keyFor('explain'))).toBe('job-1')
    expect(result.current.run).toEqual({ running: true, percent: 29, label: 'Summarising part 3 of 6…' })

    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 57, details: { stage: 'summarising', part: 5, parts: 6 } }) as never)
    await tick()
    expect(result.current.run).toMatchObject({ percent: 57, label: 'Summarising part 5 of 6…' })
  })

  it('never shows an empty bar: at least 3 percent while running', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 0, details: { stage: 'reading' } }) as never)
    const { result } = setup()
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(result.current.run.percent).toBe(3)
  })

  it('when the job completes: stops polling, hands the finished job to onCompleted, forgets the job id', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockResolvedValue(completed as never)
    const { result } = setup()
    await act(async () => { await result.current.start({}) })
    await settle()
    await tick()

    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(onCompleted).toHaveBeenCalledWith(completed)
    expect(sessionStorage.getItem(keyFor('explain'))).toBeNull()
    expect(result.current.run.running).toBe(false)

    const polls = vi.mocked(fetchIngestJob).mock.calls.length
    await tick(10_000)
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBe(polls) // stopped
  })

  it('uses the latest onCompleted, not the one from when the job started', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockResolvedValue(completed as never)
    const first = vi.fn(); const second = vi.fn()
    const { result, rerender } = renderHook(({ cb }) => useActionJob({ itemId: 'vid-1', kind: 'explain', launch, onCompleted: cb }), { initialProps: { cb: first } })
    await act(async () => { await result.current.start({}) })
    await settle()
    rerender({ cb: second })
    await tick()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('when the job fails: shows the job message, forgets it, stops, and never calls onCompleted', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'failed', progress: 0, total: 1, completed: 0, error: 'No transcript is available for this video.' } as never)
    const { result } = setup()
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).toHaveBeenCalledWith('No transcript is available for this video.')
    expect(sessionStorage.getItem(keyFor('explain'))).toBeNull()
    expect(result.current.run.running).toBe(false)
    expect(onCompleted).not.toHaveBeenCalled()
  })

  it.each([
    ['explain', 'Failed to explain'],
    ['extract-recipe', 'Failed to extract recipe'],
  ] as const)('a failed %s job without a message still tells the user', async (kind, message) => {
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'failed', progress: 0, total: 1, completed: 0 } as never)
    const { result } = setup(kind)
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).toHaveBeenCalledWith(message)
  })

  it('rejects with the server message when the job cannot be started, leaving nothing behind', async () => {
    launch.mockRejectedValue(new ApiError('Another AI task is still running. Wait for it to finish.', 409))
    const { result } = setup()
    await expect(result.current.start({})).rejects.toThrow('still running')
    expect(result.current.run.running).toBe(false)
    expect(sessionStorage.getItem(keyFor('explain'))).toBeNull()
    expect(fetchIngestJob).not.toHaveBeenCalled()
  })

  it('tolerates a few failed polls, then gives up with a clear message', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockRejectedValue(new Error('Failed to fetch'))
    const { result } = setup()
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
    const { result } = setup()
    await act(async () => { await result.current.start({}) })
    await settle()
    for (let i = 0; i < 8; i++) await tick()
    expect(toast.error).not.toHaveBeenCalled()
    expect(onCompleted).toHaveBeenCalledTimes(1)
  })

  it('quietly drops a job that no longer exists (server restarted)', async () => {
    vi.mocked(fetchIngestJob).mockRejectedValue(new Error('Job not found'))
    const { result } = setup()
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.run.running).toBe(false)
    expect(sessionStorage.getItem(keyFor('explain'))).toBeNull()
  })

  it.each([
    ['explain', /explanation finished, but the item could not be reloaded/],
    ['extract-recipe', /job finished, but the result could not be loaded/],
  ] as const)('tells the user if a finished %s job\'s result cannot be shown', async (kind, message) => {
    vi.mocked(fetchIngestJob).mockResolvedValue(completed as never)
    onCompleted.mockRejectedValue(new Error('network'))
    const { result } = setup(kind)
    await act(async () => { await result.current.start({}) })
    await settle()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(message))
    expect(sessionStorage.getItem(keyFor(kind))).toBeNull()
    expect(result.current.run.running).toBe(false)
  })

  it('resumes a job it started earlier when the page is opened again', async () => {
    sessionStorage.setItem(keyFor('explain'), 'job-77')
    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 71, details: { stage: 'writing' } }) as never)
    const { result } = setup()
    await settle()
    expect(fetchIngestJob).toHaveBeenCalledWith('job-77')
    expect(launch).not.toHaveBeenCalled()
    expect(result.current.run).toEqual({ running: true, percent: 71, label: 'Writing the explanation…' })
  })

  it('shows a result that finished while the user was away', async () => {
    sessionStorage.setItem(keyFor('explain'), 'job-77')
    vi.mocked(fetchIngestJob).mockResolvedValue(completed as never)
    setup()
    await settle()
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(keyFor('explain'))).toBeNull()
  })

  it('stops polling when the page is left, but keeps the job id so it can be resumed', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result, unmount } = setup()
    await act(async () => { await result.current.start({}) })
    await settle()
    unmount()
    const polls = vi.mocked(fetchIngestJob).mock.calls.length
    await tick(10_000)
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBe(polls)
    expect(sessionStorage.getItem(keyFor('explain'))).toBe('job-1')
  })

  it('does not carry a job from one item to the next', async () => {
    sessionStorage.setItem('memex-job:explain:other', 'job-other')
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = setup()
    await settle()
    expect(fetchIngestJob).not.toHaveBeenCalled()
    expect(result.current.run.running).toBe(false)
  })

  it('keeps Explain and Extract recipe jobs for the same item apart', async () => {
    sessionStorage.setItem(keyFor('extract-recipe'), 'job-extract')
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    const { result } = setup('explain')
    await settle()
    expect(fetchIngestJob).not.toHaveBeenCalled() // the extract job is not the explain hook's business
    expect(result.current.run.running).toBe(false)

    const extract = setup('extract-recipe')
    await settle()
    expect(fetchIngestJob).toHaveBeenCalledWith('job-extract')
    expect(extract.result.current.run.running).toBe(true)
  })
})

describe('ItemAiActions — progress UI for both actions', () => {
  // waitFor/findBy need the clock to move on its own; the 1.5 s poll is still advanced by tick().
  beforeEach(() => { vi.useRealTimers(); vi.useFakeTimers({ shouldAdvanceTime: true }) })

  it('Explain: shows a progress bar and the current step, and disables the buttons', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue(processing() as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Explaining' })).toHaveAttribute('aria-valuenow', '29'))
    expect(screen.getByTestId('job-progress')).toHaveTextContent('Summarising part 3 of 6…')
    expect(screen.getByTestId('job-progress')).toHaveTextContent('You can leave this page')
    expect(screen.getByRole('button', { name: /explaining/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /extract recipe/i })).toBeDisabled()
  })

  it('Extract recipe: shows its own progress bar and step, and disables both buttons', async () => {
    vi.mocked(extractRecipeFromItem).mockResolvedValue({ jobId: 'job-x' })
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'processing', progress: 33, total: 3, completed: 1, details: { itemId: 'vid-1', stage: 'checking' } } as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Extracting recipe' })).toHaveAttribute('aria-valuenow', '33'))
    expect(screen.getByTestId('job-progress')).toHaveTextContent('Checking it is a recipe…')
    expect(screen.getByRole('button', { name: /extracting/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /explain this/i })).toBeDisabled()
  })

  it('removes the progress bar when the job finishes', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValueOnce(processing() as never).mockResolvedValue(completed as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument())
    await tick()
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })

  it('Explain: picks up a running job on load', async () => {
    sessionStorage.setItem(keyFor('explain'), 'job-5')
    vi.mocked(fetchIngestJob).mockResolvedValue(processing({ progress: 43, details: { stage: 'summarising', part: 4, parts: 6 } }) as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43'))
    expect(screen.getByTestId('job-progress')).toHaveTextContent('Summarising part 4 of 6…')
  })

  it('Extract recipe: picks up a running job on load', async () => {
    sessionStorage.setItem(keyFor('extract-recipe'), 'job-6')
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'processing', progress: 67, total: 3, completed: 2, details: { itemId: 'vid-1', stage: 'extracting' } } as never)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Extracting recipe' })).toHaveAttribute('aria-valuenow', '67'))
    expect(screen.getByTestId('job-progress')).toHaveTextContent('Extracting the recipe…')
  })

  it('Extract recipe: shows a recipe that was found while the user was away', async () => {
    sessionStorage.setItem(keyFor('extract-recipe'), 'job-6')
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'completed', progress: 100, total: 3, completed: 3, details: { itemId: 'vid-1', found: true, recipeId: 'rec-9', confidence: 90 } } as never)
    vi.mocked(fetchItem).mockResolvedValue({ ...ITEM, id: 'rec-9', title: 'Found while away', type: 'recipe', derivedFrom: 'vid-1' } as Item)
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    expect(await screen.findByRole('link', { name: /Found while away/ })).toHaveAttribute('href', '/item/rec-9')
  })

  it('shows the server message when starting is refused, and no progress bar', async () => {
    vi.mocked(explainItem).mockRejectedValue(new ApiError('Another AI task is still running. Wait for it to finish.', 409))
    render(<ItemAiActions item={ITEM} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Another AI task is still running. Wait for it to finish.'))
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
