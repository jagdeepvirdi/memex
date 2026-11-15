import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

vi.mock('../../lib/api', async orig => ({
  ...(await orig<typeof import('../../lib/api')>()),
  explainItem: vi.fn(),
  extractRecipeFromItem: vi.fn(),
  fetchAiProviders: vi.fn(),
  fetchDerivedItems: vi.fn(),
  fetchItem: vi.fn(),
  fetchIngestJob: vi.fn(),
}))

import ItemAiActions, { DerivedFromLink, aiActionsFor } from './ItemAiActions'
import { ApiError, explainItem, extractRecipeFromItem, fetchAiProviders, fetchDerivedItems, fetchItem, fetchIngestJob } from '../../lib/api'
import type { Item } from '../../../../shared/types'

const video = (over: Partial<Item> = {}): Item => ({
  id: 'vid-1', title: 'Cook with Joe', type: 'link', content: 'https://youtu.be/dQw4w9WgXcQ',
  structured: { videoId: 'dQw4w9WgXcQ', videoKind: 'recipe' }, categories: [], tags: [], source: 'youtube',
  sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', reviewed: false,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

const EXPLANATION = {
  summary: 'It teaches pasta.', keyPoints: ['Salt the water'], steps: ['Boil', 'Toss'], takeaways: ['Practice'],
  model: 'ollama:llama3.2', generatedAt: '2026-11-15T00:00:00Z', basis: 'transcript' as const, truncated: false,
}
const RECIPE: Item = { ...video(), id: 'rec-1', title: 'Aglio e Olio', type: 'recipe', structured: {}, derivedFrom: 'vid-1' }

const DONE = { status: 'completed', progress: 100, total: 1, completed: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  // Explain is a background job: starting returns an id, and the job is polled. Default: it finishes at once.
  vi.mocked(explainItem).mockResolvedValue({ jobId: 'job-1' })
  vi.mocked(fetchIngestJob).mockResolvedValue(DONE)
  vi.mocked(fetchAiProviders).mockResolvedValue([
    { id: 'ollama', configured: true, cloud: false, models: [] },
    { id: 'claude', configured: false, cloud: true, models: [] },
    { id: 'gemini', configured: true, cloud: true, models: [] },
  ])
  vi.mocked(fetchDerivedItems).mockResolvedValue([])
})

describe('aiActionsFor', () => {
  it('offers both actions on a video link and flags a likely recipe', () => {
    expect(aiActionsFor(video())).toEqual({ explain: true, extractRecipe: true, recipeLikely: true })
  })
  it('offers both on a plain saved link', () => {
    expect(aiActionsFor(video({ structured: {}, sourceUrl: undefined, type: 'link' }))).toMatchObject({ explain: true, extractRecipe: true, recipeLikely: false })
  })
  it('does not offer recipe extraction on a recipe', () => {
    expect(aiActionsFor(video({ type: 'recipe' }))).toMatchObject({ explain: true, extractRecipe: false })
  })
  it('offers nothing on notes, encrypted items or passwords', () => {
    expect(aiActionsFor(video({ type: 'note', structured: {}, sourceUrl: undefined })).explain).toBe(false)
    expect(aiActionsFor(video({ encrypted: true })).explain).toBe(false)
    expect(aiActionsFor(video({ type: 'password' })).extractRecipe).toBe(false)
  })
})

describe('ItemAiActions', () => {
  it('renders nothing (and fetches nothing) for an ineligible item', () => {
    const { container } = render(<ItemAiActions item={video({ type: 'note', structured: {}, sourceUrl: undefined })} onItemUpdated={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchAiProviders).not.toHaveBeenCalled()
  })

  it('runs nothing until clicked', async () => {
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    await screen.findByRole('button', { name: /explain this/i })
    expect(explainItem).not.toHaveBeenCalled()
    expect(extractRecipeFromItem).not.toHaveBeenCalled()
  })

  it('disables providers without a key', async () => {
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Claude.*no key/ })).toBeDisabled())
    expect(screen.getByRole('option', { name: 'Gemini (cloud)' })).toBeEnabled()
    expect(screen.getByRole('option', { name: 'Ollama (local)' })).toBeEnabled()
  })

  it('explains with the chosen provider and hands the updated item up', async () => {
    const updated = video({ structured: { explanation: EXPLANATION } })
    vi.mocked(fetchItem).mockResolvedValue(updated)
    const onItemUpdated = vi.fn()
    render(<ItemAiActions item={video()} onItemUpdated={onItemUpdated} />)

    await waitFor(() => expect(screen.getByRole('option', { name: 'Gemini (cloud)' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'gemini' } })
    fireEvent.click(screen.getByRole('button', { name: /explain this/i }))

    await waitFor(() => expect(onItemUpdated).toHaveBeenCalledWith(updated))
    expect(explainItem).toHaveBeenCalledWith('vid-1', { provider: 'gemini', force: false })
    expect(fetchIngestJob).toHaveBeenCalledWith('job-1')
    expect(fetchItem).toHaveBeenCalledWith('vid-1')
    expect(toast.success).toHaveBeenCalledWith('Explanation saved')
  })

  it('uses the default provider when none is picked', async () => {
    vi.mocked(fetchItem).mockResolvedValue(video())
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(explainItem).toHaveBeenCalled())
    expect(vi.mocked(explainItem).mock.calls[0][1]).toEqual({ provider: undefined, force: false })
  })

  it('shows a saved explanation and re-runs with force', async () => {
    vi.mocked(fetchItem).mockResolvedValue(video())
    render(<ItemAiActions item={video({ structured: { explanation: EXPLANATION } })} onItemUpdated={vi.fn()} />)
    const card = await screen.findByTestId('explanation')
    expect(card).toHaveTextContent('It teaches pasta.')
    expect(card).toHaveTextContent('Salt the water')
    expect(card).toHaveTextContent('ollama:llama3.2')
    fireEvent.click(screen.getByRole('button', { name: /explain again/i }))
    await waitFor(() => expect(explainItem).toHaveBeenCalledWith('vid-1', { provider: undefined, force: true }))
  })

  it('toasts the server message when explaining fails', async () => {
    vi.mocked(explainItem).mockRejectedValue(new ApiError('No transcript is available for this video.', 422))
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No transcript is available for this video.'))
  })

  // ── Extract recipe is a background job too: start → poll → (found | nothing found | failed) ──
  const EXTRACT_FOUND = (recipeId = 'rec-1') => ({
    status: 'completed', progress: 100, total: 3, completed: 3, details: { itemId: 'vid-1', found: true, recipeId, confidence: 80 },
  })
  /** The extract job answers as `job`; every other job id (explain) answers DONE. */
  function extractJob(job: unknown) {
    vi.mocked(extractRecipeFromItem).mockResolvedValue({ jobId: 'job-x' })
    vi.mocked(fetchIngestJob).mockImplementation((async (id: string) => (id === 'job-x' ? job : DONE)) as never)
  }

  it('extracts a recipe and lists the new linked item', async () => {
    extractJob(EXTRACT_FOUND())
    vi.mocked(fetchItem).mockImplementation((async (id: string) => (id === 'rec-1' ? RECIPE : video())) as never)
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))

    const list = await screen.findByTestId('derived-recipes')
    expect(list).toHaveTextContent('Aglio e Olio')
    expect(list).toHaveTextContent('needs review')
    expect(screen.getByRole('link', { name: /Aglio e Olio/ })).toHaveAttribute('href', '/item/rec-1')
    expect(extractRecipeFromItem).toHaveBeenCalledWith('vid-1', { provider: undefined, force: false })
    expect(fetchIngestJob).toHaveBeenCalledWith('job-x')
    expect(fetchItem).toHaveBeenCalledWith('rec-1')
    expect(toast.success).toHaveBeenCalledWith('Recipe saved as a new item — review it in the queue')
    expect(screen.getByRole('button', { name: /extract another recipe/i })).toBeInTheDocument()
  })

  it('lists recipes already extracted, and extracting again sends force', async () => {
    vi.mocked(fetchDerivedItems).mockResolvedValue([RECIPE])
    extractJob(EXTRACT_FOUND('rec-2'))
    vi.mocked(fetchItem).mockImplementation((async (id: string) => (id === 'rec-2' ? { ...RECIPE, id: 'rec-2' } : video())) as never)
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract another recipe/i }))
    await waitFor(() => expect(extractRecipeFromItem).toHaveBeenCalledWith('vid-1', { provider: undefined, force: true }))
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Aglio e Olio/ })).toHaveLength(2))
  })

  it('does not list the same recipe twice if it is already shown', async () => {
    vi.mocked(fetchDerivedItems).mockResolvedValue([RECIPE])
    extractJob(EXTRACT_FOUND('rec-1'))
    vi.mocked(fetchItem).mockImplementation((async (id: string) => (id === 'rec-1' ? RECIPE : video())) as never)
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract another recipe/i }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(screen.getAllByRole('link', { name: /Aglio e Olio/ })).toHaveLength(1)
  })

  it('shows an inline "nothing saved" note when no recipe is found — a completed job, not an error', async () => {
    extractJob({ status: 'completed', progress: 100, total: 3, completed: 3, details: { itemId: 'vid-1', found: false, reason: 'This does not look like a recipe or cooking video.' } })
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('This does not look like a recipe or cooking video. Nothing was saved.')
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.queryByTestId('derived-recipes')).not.toBeInTheDocument()
    expect(fetchItem).not.toHaveBeenCalledWith('rec-1')
  })

  it('has a sensible note even if a completed job carries no reason', async () => {
    extractJob({ status: 'completed', progress: 100, total: 3, completed: 3, details: { itemId: 'vid-1', found: false } })
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('No recipe was found in this content. Nothing was saved.')
  })

  it('clears an old "nothing saved" note when extracting again', async () => {
    extractJob({ status: 'completed', progress: 100, total: 3, completed: 3, details: { itemId: 'vid-1', found: false, reason: 'First try found nothing.' } })
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    await screen.findByText(/First try found nothing/)
    extractJob({ status: 'processing', progress: 33, total: 3, completed: 1, details: { itemId: 'vid-1', stage: 'checking' } })
    fireEvent.click(screen.getByRole('button', { name: /extract recipe/i }))
    await waitFor(() => expect(screen.queryByText(/First try found nothing/)).not.toBeInTheDocument())
  })

  it('toasts the job message when extraction fails', async () => {
    extractJob({ status: 'failed', progress: 0, total: 3, completed: 0, error: 'Cannot use claude: Strict Local Mode is on' })
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot use claude: Strict Local Mode is on'))
    expect(screen.queryByTestId('derived-recipes')).not.toBeInTheDocument()
  })

  it('toasts the server message when extraction cannot be started (already extracted / another task running)', async () => {
    vi.mocked(extractRecipeFromItem).mockRejectedValue(new ApiError('Another AI task is still running. Wait for it to finish.', 409))
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Another AI task is still running. Wait for it to finish.'))
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('tells the user if the recipe was saved but could not be loaded', async () => {
    extractJob(EXTRACT_FOUND())
    vi.mocked(fetchItem).mockRejectedValue(new Error('network'))
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/)))
  })
})

describe('DerivedFromLink', () => {
  it('links back to the source item by title', async () => {
    vi.mocked(fetchItem).mockResolvedValue(video())
    render(<DerivedFromLink itemId="vid-1" />)
    const link = screen.getByTestId('derived-from')
    expect(link).toHaveAttribute('href', '/item/vid-1')
    await waitFor(() => expect(link).toHaveTextContent('From: Cook with Joe'))
  })

  it('still renders a working link if the source cannot be loaded', async () => {
    vi.mocked(fetchItem).mockRejectedValue(new Error('gone'))
    render(<DerivedFromLink itemId="vid-9" />)
    expect(screen.getByTestId('derived-from')).toHaveTextContent('From: original item')
  })
})
