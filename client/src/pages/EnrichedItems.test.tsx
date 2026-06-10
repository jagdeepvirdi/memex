import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockSetSearchParams = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
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
  default: ({ item, onClick }: any) => (
    <div
      data-testid={`item-card-${item.id}`}
      onClick={onClick}
    >
      {item.title}
    </div>
  ),
}))

vi.mock('../components/Skeleton', () => ({
  CardSkeleton: () => <div data-testid="card-skeleton" />,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockFetchItems = vi.fn()
const mockDeleteItemsBulk = vi.fn()
const mockDeleteItem = vi.fn()
const mockUpdateItem = vi.fn()
vi.mock('../lib/api', () => ({
  fetchItems: (...a: any[]) => mockFetchItems(...a),
  deleteItemsBulk: (...a: any[]) => mockDeleteItemsBulk(...a),
  deleteItem: (...a: any[]) => mockDeleteItem(...a),
  updateItem: (...a: any[]) => mockUpdateItem(...a),
}))

import EnrichedItemsPage from './EnrichedItems'

const makeItem = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id, title,
  type: 'note' as const,
  content: 'Some enriched content here.',
  structured: { summary: 'An AI-generated summary.' },
  source: 'manual' as const,
  reviewed: true,
  confidence: 90,
  createdAt: new Date(),
  updatedAt: new Date(),
  categories: ['Personal', 'Notes'],
  tags: ['ai', 'enriched'],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchItems.mockResolvedValue({ items: [], total: 0 })
  mockDeleteItemsBulk.mockResolvedValue({})
  mockDeleteItem.mockResolvedValue({})
  mockUpdateItem.mockResolvedValue(makeItem('x', 'Updated'))
  // Default view mode: card (localStorage default)
  localStorage.removeItem('enriched-view-mode')
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('EnrichedItemsPage — heading & structure', () => {
  it('renders the Sidebar', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeInTheDocument())
  })

  it('renders the AI Enriched Notes heading', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('AI Enriched Notes')).toBeInTheDocument())
  })

  it('renders type filter pills', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument()
      expect(screen.getByText('Notes')).toBeInTheDocument()
      expect(screen.getByText('Recipes')).toBeInTheDocument()
      expect(screen.getByText('Media')).toBeInTheDocument()
      expect(screen.getByText('Books')).toBeInTheDocument()
      expect(screen.getByText('Links')).toBeInTheDocument()
    })
  })
})

describe('EnrichedItemsPage — loading state', () => {
  it('shows card skeleton loaders while loading', () => {
    mockFetchItems.mockReturnValue(new Promise(() => {}))
    render(<EnrichedItemsPage />)
    expect(screen.getAllByTestId('card-skeleton').length).toBeGreaterThan(0)
  })
})

describe('EnrichedItemsPage — empty state', () => {
  it('shows the no-enriched-notes message when empty', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() =>
      expect(
        screen.getByText('No enriched notes yet. Run enrichment from Settings.')
      ).toBeInTheDocument()
    )
  })
})

describe('EnrichedItemsPage — with items', () => {
  beforeEach(() => {
    mockFetchItems.mockResolvedValue({
      items: [
        makeItem('i1', 'Sourdough Bread Recipe'),
        makeItem('i2', 'Investment Notes'),
        makeItem('i3', 'Travel Wishlist'),
      ],
      total: 3,
    })
  })

  it('renders item cards for each enriched item', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Sourdough Bread Recipe')).toBeInTheDocument())
    expect(screen.getByText('Investment Notes')).toBeInTheDocument()
    expect(screen.getByText('Travel Wishlist')).toBeInTheDocument()
  })

  it('shows item count badge', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('3 enriched')).toBeInTheDocument())
  })

  it('shows Select All Page button', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Select All Page')).toBeInTheDocument())
  })

  it('navigates to item detail when card is clicked', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByTestId('item-card-i1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('item-card-i1'))
    expect(mockNavigate).toHaveBeenCalledWith('/item/i1')
  })
})

describe('EnrichedItemsPage — selection', () => {
  beforeEach(() => {
    mockFetchItems.mockResolvedValue({
      items: [makeItem('i1', 'Recipe A'), makeItem('i2', 'Note B')],
      total: 2,
    })
  })

  it('shows "Select All Page" button when items are present', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Select All Page')).toBeInTheDocument())
  })

  it('shows "Deselect All" after selecting all', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Select All Page')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Select All Page'))
    expect(screen.getByText('Deselect All')).toBeInTheDocument()
  })

  it('shows selected count after selecting all', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Select All Page')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Select All Page'))
    await waitFor(() => expect(screen.getByText('2 selected')).toBeInTheDocument())
  })

  it('shows bulk delete button when items are selected', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Select All Page')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Select All Page'))
    await waitFor(() =>
      expect(screen.getByText(/Delete Selected/)).toBeInTheDocument()
    )
  })
})

describe('EnrichedItemsPage — view mode toggle', () => {
  beforeEach(() => {
    mockFetchItems.mockResolvedValue({ items: [], total: 0 })
  })

  it('renders card view toggle button', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => {
      const cardViewBtn = document.querySelector('[title="Card view"]')
      expect(cardViewBtn).toBeInTheDocument()
    })
  })

  it('renders table view toggle button', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => {
      const tableViewBtn = document.querySelector('[title="Table view"]')
      expect(tableViewBtn).toBeInTheDocument()
    })
  })

  it('switches to table view on table button click', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(document.querySelector('[title="Table view"]')).not.toBeNull())
    fireEvent.click(document.querySelector('[title="Table view"]')!)
    // In table view with no items: "No enriched notes found for this filter."
    await waitFor(() =>
      expect(
        screen.getByText('No enriched notes found for this filter.')
      ).toBeInTheDocument()
    )
  })
})

describe('EnrichedItemsPage — error state', () => {
  it('shows error banner when fetch fails', async () => {
    mockFetchItems.mockRejectedValue(new Error('network error'))
    render(<EnrichedItemsPage />)
    await waitFor(() =>
      expect(
        screen.getByText('Failed to load items. Please try again.')
      ).toBeInTheDocument()
    )
  })

  it('shows Reload link in error banner', async () => {
    mockFetchItems.mockRejectedValue(new Error('fail'))
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Reload')).toBeInTheDocument())
  })
})

describe('EnrichedItemsPage — table view with items', () => {
  beforeEach(() => {
    localStorage.setItem('enriched-view-mode', 'table')
    mockFetchItems.mockResolvedValue({
      items: [
        makeItem('t1', 'Test Note A', { type: 'note', tags: ['alpha', 'beta'], confidence: 92 }),
        makeItem('t2', 'Test Note B', { type: 'recipe', tags: [], confidence: 55 }),
      ],
      total: 2,
    })
  })

  afterEach(() => {
    localStorage.removeItem('enriched-view-mode')
  })

  it('renders item titles in table rows', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Test Note A')).toBeInTheDocument())
    expect(screen.getByText('Test Note B')).toBeInTheDocument()
  })

  it('renders type badges in table rows', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('note')).toBeInTheDocument())
    expect(screen.getByText('recipe')).toBeInTheDocument()
  })

  it('renders tag pills with # prefix', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('#alpha')).toBeInTheDocument())
  })

  it('renders confidence badge for items with confidence', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('92%')).toBeInTheDocument())
  })

  it('renders the table header columns', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Title')).toBeInTheDocument())
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('navigates to item detail when title is clicked in table view', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Test Note A')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Test Note A'))
    expect(mockNavigate).toHaveBeenCalledWith('/item/t1')
  })

  it('shows pagination text in table view', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() =>
      expect(screen.getByText(/Showing 1 to 2 of 2 enriched notes/)).toBeInTheDocument()
    )
  })

  it('renders checkboxes for each item in table view', async () => {
    render(<EnrichedItemsPage />)
    await waitFor(() => expect(screen.getByText('Test Note A')).toBeInTheDocument())
    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
  })
})
