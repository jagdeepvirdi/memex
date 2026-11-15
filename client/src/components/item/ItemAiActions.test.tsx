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
}))

import ItemAiActions, { DerivedFromLink, aiActionsFor } from './ItemAiActions'
import { ApiError, explainItem, extractRecipeFromItem, fetchAiProviders, fetchDerivedItems, fetchItem } from '../../lib/api'
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

beforeEach(() => {
  vi.clearAllMocks()
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
    vi.mocked(explainItem).mockResolvedValue({ item: updated, explanation: EXPLANATION })
    const onItemUpdated = vi.fn()
    render(<ItemAiActions item={video()} onItemUpdated={onItemUpdated} />)

    await waitFor(() => expect(screen.getByRole('option', { name: 'Gemini (cloud)' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'gemini' } })
    fireEvent.click(screen.getByRole('button', { name: /explain this/i }))

    await waitFor(() => expect(onItemUpdated).toHaveBeenCalledWith(updated))
    expect(explainItem).toHaveBeenCalledWith('vid-1', { provider: 'gemini', force: false })
    expect(toast.success).toHaveBeenCalled()
  })

  it('uses the default provider when none is picked', async () => {
    vi.mocked(explainItem).mockResolvedValue({ item: video(), explanation: EXPLANATION })
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /explain this/i }))
    await waitFor(() => expect(explainItem).toHaveBeenCalled())
    expect(vi.mocked(explainItem).mock.calls[0][1]).toEqual({ provider: undefined, force: false })
  })

  it('shows a saved explanation and re-runs with force', async () => {
    vi.mocked(explainItem).mockResolvedValue({ item: video(), explanation: EXPLANATION })
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

  it('extracts a recipe and lists the new linked item', async () => {
    vi.mocked(extractRecipeFromItem).mockResolvedValue({ recipe: RECIPE, confidence: 80 })
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))

    const list = await screen.findByTestId('derived-recipes')
    expect(list).toHaveTextContent('Aglio e Olio')
    expect(list).toHaveTextContent('needs review')
    expect(screen.getByRole('link', { name: /Aglio e Olio/ })).toHaveAttribute('href', '/item/rec-1')
    expect(extractRecipeFromItem).toHaveBeenCalledWith('vid-1', { provider: undefined, force: false })
    expect(screen.getByRole('button', { name: /extract another recipe/i })).toBeInTheDocument()
  })

  it('lists recipes already extracted, and extracting again sends force', async () => {
    vi.mocked(fetchDerivedItems).mockResolvedValue([RECIPE])
    vi.mocked(extractRecipeFromItem).mockResolvedValue({ recipe: { ...RECIPE, id: 'rec-2' }, confidence: 70 })
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract another recipe/i }))
    await waitFor(() => expect(extractRecipeFromItem).toHaveBeenCalledWith('vid-1', { provider: undefined, force: true }))
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Aglio e Olio/ })).toHaveLength(2))
  })

  it('shows an inline "nothing saved" note when no recipe is found, without an error toast', async () => {
    vi.mocked(extractRecipeFromItem).mockRejectedValue(
      new ApiError('No recipe was found in this content.', 422, { found: false, error: 'No recipe was found in this content.' }),
    )
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('No recipe was found in this content. Nothing was saved.')
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.queryByTestId('derived-recipes')).not.toBeInTheDocument()
  })

  it('toasts other extraction failures', async () => {
    vi.mocked(extractRecipeFromItem).mockRejectedValue(new ApiError('Cannot use claude: Strict Local Mode is on', 409))
    render(<ItemAiActions item={video()} onItemUpdated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /extract recipe/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot use claude: Strict Local Mode is on'))
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
