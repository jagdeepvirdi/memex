import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'item-123' }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}))

vi.mock('../components/AppHeader', () => ({
  AppHeader: Object.assign(
    ({ left, actions }: any) => (
      <header data-testid="app-header">
        {left}
        {actions}
      </header>
    ),
    { Spacer: () => <div /> }
  ),
}))

vi.mock('../components/cards/ItemCard', () => ({
  default: ({ item }: any) => <div data-testid={`related-${item.id}`}>{item.title}</div>,
}))

vi.mock('../components/Editor', () => ({
  default: ({ content }: any) => <div data-testid="editor">{content}</div>,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockVaultKey: any = null
vi.mock('../store/vaultStore', () => ({
  useVaultStore: () => ({ vaultKey: mockVaultKey, isLocked: true }),
}))

vi.mock('../lib/crypto', () => ({
  encryptVaultItem: vi.fn().mockResolvedValue({ ciphertext: 'enc', iv: 'iv' }),
}))

const mockApiFetch = vi.fn()
const mockFetchItemExtractions = vi.fn()
const mockUpdateItem = vi.fn()
vi.mock('../lib/api', () => ({
  apiFetch: (...a: any[]) => mockApiFetch(...a),
  migrateToVault: vi.fn(),
  fetchItemExtractions: (...a: any[]) => mockFetchItemExtractions(...a),
  applyExtraction: vi.fn(),
  reClassifyItem: vi.fn(),
  setReminder: vi.fn(),
  shareItem: vi.fn(),
  unshareItem: vi.fn(),
  updateItem: (...a: any[]) => mockUpdateItem(...a),
  summarizeItemLinks: vi.fn(),
  // ItemAiActions (mounted for link/video items)
  explainItem: vi.fn(),
  extractRecipeFromItem: vi.fn(),
  fetchAiProviders: vi.fn().mockResolvedValue([]),
  fetchDerivedItems: vi.fn().mockResolvedValue([]),
  fetchItemEntities: vi.fn().mockResolvedValue([]),
  fetchItem: vi.fn().mockResolvedValue({ id: 'parent-1', title: 'Parent video' }),
  ApiError: class ApiError extends Error {},
}))

import ItemPage from './Item'
import { reClassifyItem } from '../lib/api'
import { toast } from 'sonner'

const makeItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-123',
  title: 'Understanding Sourdough',
  type: 'recipe' as const,
  content: 'Mix flour and water. Let ferment for 12 hours.',
  structured: { cuisine: 'Baking', summary: 'A guide to sourdough bread.' },
  source: 'manual' as const,
  reviewed: true,
  confidence: 85,
  createdAt: new Date('2024-03-15T10:00:00Z'),
  updatedAt: new Date('2024-03-15T10:00:00Z'),
  categories: ['Food', 'Bakery', 'Bread'],
  tags: ['sourdough', 'fermentation', 'bread'],
  sourceUrl: undefined,
  publicToken: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchItemExtractions.mockResolvedValue([])
})

// ── Loading state ─────────────────────────────────────────────────────────────

describe('ItemPage — loading state', () => {
  it('shows the loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    render(<ItemPage />)
    expect(screen.getByText('Loading item details...')).toBeInTheDocument()
  })

  it('renders sidebar during loading', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    render(<ItemPage />)
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
  })
})

// ── Not found state ───────────────────────────────────────────────────────────

describe('ItemPage — item not found', () => {
  it('shows "Item not found" when fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Not found'))
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Item not found')).toBeInTheDocument()
    )
  })

  it('shows link back to Dashboard on not found', async () => {
    mockApiFetch.mockRejectedValue(new Error('404'))
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Back to Dashboard')).toBeInTheDocument()
    )
  })
})

// ── Item display ──────────────────────────────────────────────────────────────

describe('ItemPage — item display', () => {
  beforeEach(() => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem())
      .mockResolvedValueOnce([])
  })

  it('renders the item title', async () => {
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Understanding Sourdough')).toBeInTheDocument()
    )
  })

  it('renders the item type in the header', async () => {
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('recipe')).toBeInTheDocument()
    )
  })

  it('renders the category breadcrumb', async () => {
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Food › Bakery › Bread')).toBeInTheDocument()
    )
  })

  it('renders the item content via Editor', async () => {
    render(<ItemPage />)
    await waitFor(() => expect(screen.getByTestId('editor')).toBeInTheDocument())
    expect(screen.getByTestId('editor')).toHaveTextContent('Mix flour and water')
  })

  it('renders the tags', async () => {
    render(<ItemPage />)
    await waitFor(() => {
      expect(screen.getByText('#sourdough')).toBeInTheDocument()
      expect(screen.getByText('#fermentation')).toBeInTheDocument()
    })
  })

  it('renders the Edit button', async () => {
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByTitle('Edit Item')).toBeInTheDocument()
    )
  })

  it('renders the Delete button', async () => {
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByTitle('Delete Item')).toBeInTheDocument()
    )
  })

  it('renders the Move to Vault button', async () => {
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByTitle('Move to Secure Vault')).toBeInTheDocument()
    )
  })
})

// ── Edit mode ─────────────────────────────────────────────────────────────────

describe('ItemPage — edit mode', () => {
  beforeEach(() => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem())
      .mockResolvedValueOnce([])
  })

  it('switches to edit mode when Edit is clicked', async () => {
    render(<ItemPage />)
    await waitFor(() => expect(screen.getByTitle('Edit Item')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Edit Item'))
    await waitFor(() => expect(screen.getByText('Save')).toBeInTheDocument())
  })

  it('shows Cancel button in edit mode', async () => {
    render(<ItemPage />)
    await waitFor(() => expect(screen.getByTitle('Edit Item')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Edit Item'))
    await waitFor(() => expect(screen.getByTitle('Cancel')).toBeInTheDocument())
  })

  it('cancels edit mode when Cancel is clicked', async () => {
    render(<ItemPage />)
    await waitFor(() => expect(screen.getByTitle('Edit Item')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Edit Item'))
    await waitFor(() => expect(screen.getByTitle('Cancel')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Cancel'))
    await waitFor(() => expect(screen.getByTitle('Edit Item')).toBeInTheDocument())
  })
})

// ── Related items ─────────────────────────────────────────────────────────────

describe('ItemPage — related items', () => {
  it('renders related item cards when available', async () => {
    const relatedItem = makeItem({ id: 'rel-1', title: 'Rye Bread Guide' })
    mockApiFetch
      .mockResolvedValueOnce(makeItem())
      .mockResolvedValueOnce([relatedItem])
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Rye Bread Guide')).toBeInTheDocument()
    )
  })

  it('shows Related Intelligence section header', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem())
      .mockResolvedValueOnce([makeItem({ id: 'rel-1', title: 'Related Note' })])
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Related Intelligence')).toBeInTheDocument()
    )
  })
})

// ── Source URL ────────────────────────────────────────────────────────────────

describe('ItemPage — source URL', () => {
  it('renders Original Source link when sourceUrl is set', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem({ sourceUrl: 'https://example.com/recipe' }))
      .mockResolvedValueOnce([])
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Original Source')).toBeInTheDocument()
    )
  })

  it('does not render Original Source when sourceUrl is absent', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem({ sourceUrl: undefined }))
      .mockResolvedValueOnce([])
    render(<ItemPage />)
    await waitFor(() =>
      expect(screen.queryByText('Original Source')).not.toBeInTheDocument()
    )
  })
})

// ── Priority ──────────────────────────────────────────────────────────────────

describe('ItemPage — priority', () => {
  const load = (over: Record<string, unknown> = {}) =>
    mockApiFetch.mockResolvedValueOnce(makeItem(over)).mockResolvedValueOnce([])

  it('shows the current priority as pressed', async () => {
    load({ priority: 'useful' })
    render(<ItemPage />)
    const btn = await screen.findByRole('button', { name: 'Useful' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Essential' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('saves a new priority through updateItem and reflects it immediately', async () => {
    load()
    mockUpdateItem.mockResolvedValue(makeItem({ priority: 'essential' }))
    render(<ItemPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Essential' }))

    expect(screen.getByRole('button', { name: 'Essential' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(mockUpdateItem).toHaveBeenCalledWith('item-123', { priority: 'essential' }))
  })

  it('clears the priority by clicking the active option', async () => {
    load({ priority: 'skip' })
    mockUpdateItem.mockResolvedValue(makeItem())
    render(<ItemPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(mockUpdateItem).toHaveBeenCalledWith('item-123', { priority: null }))
  })

  it('rolls back and reports an error when the save fails', async () => {
    load({ priority: 'useful' })
    mockUpdateItem.mockRejectedValue(new Error('500'))
    render(<ItemPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Essential' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Useful' })).toHaveAttribute('aria-pressed', 'true')
    )
    expect(screen.getByRole('button', { name: 'Essential' })).toHaveAttribute('aria-pressed', 'false')
  })
})

// ── Developer knowledge ───────────────────────────────────────────────────────

describe('ItemPage — developer knowledge block', () => {
  it('shows repo name (linked), what-it-does and creator for a repo item', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem({
        type: 'link',
        structured: {
          kind: 'repo', repoName: 'anthropics/claude-code', repoUrl: 'https://github.com/anthropics/claude-code',
          whatItDoes: 'A terminal coding agent.', creatorHandle: '@someone',
        },
      }))
      .mockResolvedValueOnce([])
    render(<ItemPage />)

    const block = await screen.findByTestId('dev-knowledge')
    expect(block).toHaveTextContent('Repository')
    expect(screen.getByRole('link', { name: /anthropics\/claude-code/ })).toHaveAttribute('href', 'https://github.com/anthropics/claude-code')
    expect(block).toHaveTextContent('A terminal coding agent.')
    expect(block).toHaveTextContent('Shared by @someone')
  })

  it('shows prompt text for a prompt item', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem({ type: 'link', structured: { kind: 'prompt', promptText: 'You are a reviewer.' } }))
      .mockResolvedValueOnce([])
    render(<ItemPage />)
    expect(await screen.findByTestId('dev-knowledge')).toHaveTextContent('You are a reviewer.')
  })

  it('does not render for ordinary items or an unknown kind', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeItem({ structured: { kind: 'bogus', summary: 'x' } }))
      .mockResolvedValueOnce([])
    render(<ItemPage />)
    await screen.findByText('Understanding Sourdough')
    expect(screen.queryByTestId('dev-knowledge')).not.toBeInTheDocument()
  })
})

// ── On-demand AI actions + provenance link ────────────────────────────────────

describe('ItemPage — explain / extract recipe', () => {
  const videoItem = (over: Record<string, unknown> = {}) => makeItem({
    type: 'link', source: 'youtube', content: 'https://youtu.be/dQw4w9WgXcQ',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    structured: { videoId: 'dQw4w9WgXcQ', videoKind: 'recipe' }, ...over,
  })

  it('shows Explain and Extract recipe on a video item', async () => {
    mockApiFetch.mockResolvedValueOnce(videoItem()).mockResolvedValueOnce([])
    render(<ItemPage />)
    expect(await screen.findByRole('button', { name: /explain this/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /extract recipe/i })).toBeInTheDocument()
  })

  it('shows a saved explanation from structured.explanation', async () => {
    mockApiFetch.mockResolvedValueOnce(videoItem({
      structured: { explanation: {
        summary: 'Pasta basics.', keyPoints: ['Salt'], steps: [], takeaways: [],
        model: 'ollama:llama3.2', generatedAt: '2026-11-15T00:00:00Z', basis: 'transcript', truncated: false,
      } },
    })).mockResolvedValueOnce([])
    render(<ItemPage />)
    expect(await screen.findByTestId('explanation')).toHaveTextContent('Pasta basics.')
  })

  it('does not show them on an ordinary note, nor on a recipe for extraction', async () => {
    mockApiFetch.mockResolvedValueOnce(makeItem({ type: 'note' })).mockResolvedValueOnce([])
    render(<ItemPage />)
    await screen.findByText('Understanding Sourdough')
    expect(screen.queryByTestId('ai-actions')).not.toBeInTheDocument()
  })

  it('links a derived recipe back to the item it came from', async () => {
    mockApiFetch.mockResolvedValueOnce(makeItem({ derivedFrom: 'parent-1' })).mockResolvedValueOnce([])
    render(<ItemPage />)
    const link = await screen.findByTestId('derived-from')
    expect(link).toHaveAttribute('href', '/item/parent-1')
    await waitFor(() => expect(link).toHaveTextContent('From: Parent video'))
  })

  it('has no provenance link for items that were not derived', async () => {
    mockApiFetch.mockResolvedValueOnce(makeItem()).mockResolvedValueOnce([])
    render(<ItemPage />)
    await screen.findByText('Understanding Sourdough')
    expect(screen.queryByTestId('derived-from')).not.toBeInTheDocument()
  })
})

// ── Connected entities ────────────────────────────────────────────────────────

describe('ItemPage — connected entities', () => {
  it('shows the Connected section when the item has links', async () => {
    const api = await import('../lib/api')
    vi.mocked(api.fetchItemEntities).mockResolvedValueOnce([
      { id: 'e1', name: '@someone', type: 'person', roles: ['creator'], total: 2, others: [{ id: 'x', title: 'Another', type: 'link' }] },
    ] as never)
    mockApiFetch.mockResolvedValueOnce(makeItem()).mockResolvedValueOnce([])
    render(<ItemPage />)
    expect(await screen.findByTestId('connected')).toHaveTextContent('@someone')
  })

  it('shows nothing for an item with no links', async () => {
    mockApiFetch.mockResolvedValueOnce(makeItem()).mockResolvedValueOnce([])
    render(<ItemPage />)
    await screen.findByText('Understanding Sourdough')
    expect(screen.queryByTestId('connected')).not.toBeInTheDocument()
  })

  it('does not look up links for an encrypted item', async () => {
    const api = await import('../lib/api')
    vi.mocked(api.fetchItemEntities).mockClear()
    mockApiFetch.mockResolvedValueOnce(makeItem({ encrypted: true })).mockResolvedValueOnce([])
    render(<ItemPage />)
    await screen.findByText('Understanding Sourdough')
    expect(api.fetchItemEntities).not.toHaveBeenCalled()
  })
})

// ── Which AI answered, and Redo with... ──────────────────────

describe('ItemPage — which AI answered', () => {
  it('shows the AI that classified the item', async () => {
    mockApiFetch.mockResolvedValue(makeItem({ extractionModel: 'gemini:gemini-3.8-flash' }))
    render(<ItemPage />)
    expect(await screen.findByTestId('ai-badge')).toHaveTextContent('Classified by Gemini')
  })

  it('says when an item stays on this machine, and why', async () => {
    mockApiFetch.mockResolvedValue(makeItem({ localOnly: { reason: 'tag', message: 'It is tagged private, no-cloud or local-only.' } }))
    render(<ItemPage />)
    const chip = await screen.findByTestId('local-only-badge')
    expect(chip).toHaveAttribute('title', 'It is tagged private, no-cloud or local-only.')
  })
})

describe('ItemPage — Re-classify with a chosen AI', () => {
  const open = async (over: Record<string, unknown> = {}) => {
    mockApiFetch.mockResolvedValue(makeItem(over))
    render(<ItemPage />)
    await screen.findByLabelText('Re-classify with')
  }
  const NEW_EXTRACTION = { id: 'ext-9', item_id: 'item-123', model: 'gemini:gemini-3.8-flash', type: 'recipe', title: 'T', summary: 's', structured: {}, categories: [], tags: [], confidence: 90, applied: false, created_at: new Date().toISOString() }

  it('uses the normal routing by default', async () => {
    vi.mocked(reClassifyItem).mockResolvedValue(NEW_EXTRACTION as never)
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Re-classify/ }))
    await waitFor(() => expect(reClassifyItem).toHaveBeenCalledWith('item-123', undefined))
  })

  it('pins the run to the AI you pick, and adds the result to the history', async () => {
    vi.mocked(reClassifyItem).mockResolvedValue(NEW_EXTRACTION as never)
    vi.mocked(await import('../lib/api').then(m => m.fetchAiProviders)).mockResolvedValue([{ id: 'ollama', configured: true, cloud: false, models: [] }, { id: 'gemini', configured: true, cloud: true, models: [] }] as never)
    await open()
    await waitFor(() => expect((screen.getByLabelText('Re-classify with') as HTMLSelectElement).textContent).toMatch(/Gemini/))
    fireEvent.change(screen.getByLabelText('Re-classify with'), { target: { value: 'gemini' } })
    fireEvent.click(screen.getByRole('button', { name: /Re-classify/ }))
    await waitFor(() => expect(reClassifyItem).toHaveBeenCalledWith('item-123', 'gemini'))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })

  it('shows the reason the server gives instead of a generic failure', async () => {
    vi.mocked(reClassifyItem).mockRejectedValue(new Error('Cannot use gemini: this content is marked private and may not leave your machine'))
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Re-classify/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot use gemini: this content is marked private and may not leave your machine'))
  })

  it('falls back to a plain message when the error has none', async () => {
    vi.mocked(reClassifyItem).mockRejectedValue(new Error(''))
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Re-classify/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Re-classification failed'))
  })
})
