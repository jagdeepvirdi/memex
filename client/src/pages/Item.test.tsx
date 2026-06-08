import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'item-123' }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
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
vi.mock('../lib/api', () => ({
  apiFetch: (...a: any[]) => mockApiFetch(...a),
  migrateToVault: vi.fn(),
  fetchItemExtractions: (...a: any[]) => mockFetchItemExtractions(...a),
  applyExtraction: vi.fn(),
  reClassifyItem: vi.fn(),
  setReminder: vi.fn(),
  shareItem: vi.fn(),
  unshareItem: vi.fn(),
  updateItem: vi.fn(),
}))

import ItemPage from './Item'

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
