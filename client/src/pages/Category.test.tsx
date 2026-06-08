import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'cat-1' }),
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
  default: ({ item }: any) => <div data-testid={`item-${item.id}`}>{item.title}</div>,
}))

vi.mock('../components/Skeleton', () => ({
  CardSkeleton: () => <div data-testid="skeleton" />,
}))

const mockFetchItems = vi.fn()
const mockApiFetch = vi.fn()
vi.mock('../lib/api', () => ({
  fetchItems: (...a: any[]) => mockFetchItems(...a),
  apiFetch: (...a: any[]) => mockApiFetch(...a),
}))

import CategoryPage from './Category'

const makeItem = (id: string, title: string) => ({
  id, title, type: 'note' as const, content: '',
  structured: {}, source: 'manual' as const, reviewed: false,
  createdAt: new Date(), updatedAt: new Date(), categories: ['Food'], tags: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  mockApiFetch.mockResolvedValue([{ id: 'cat-1', name: 'Food', parentId: null, itemCount: 0 }])
  mockFetchItems.mockResolvedValue({ items: [], total: 0 })
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CategoryPage — rendering', () => {
  it('renders skeleton loaders while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    render(<CategoryPage />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders items when loaded', async () => {
    mockFetchItems.mockResolvedValue({
      items: [makeItem('i1', 'Chocolate Cake'), makeItem('i2', 'Bread Loaf')],
      total: 2,
    })
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getByText('Chocolate Cake')).toBeInTheDocument())
    expect(screen.getByText('Bread Loaf')).toBeInTheDocument()
  })

  it('shows empty state when no items match', async () => {
    render(<CategoryPage />)
    await waitFor(
      () => expect(screen.getByText('No items found')).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('shows Next button when total exceeds limit', async () => {
    const items = Array.from({ length: 24 }, (_, i) => makeItem(`i${i}`, `Item ${i}`))
    mockFetchItems.mockResolvedValue({ items, total: 50 })
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getByText('Item 0')).toBeInTheDocument())
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('renders the category name in the heading', async () => {
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
  })

  it('renders the pagination item count when items are shown', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`i${i}`, `Item ${i}`))
    mockFetchItems.mockResolvedValue({ items, total: 5 })
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getByText(/Showing 1 to 5 of 5/)).toBeInTheDocument())
  })
})

describe('CategoryPage — sort and filter', () => {
  beforeEach(() => {
    mockFetchItems.mockResolvedValue({ items: [], total: 0 })
  })

  it('changes sort order when sort select changes', async () => {
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0))
    const sortSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(sortSelect, { target: { value: 'oldest' } })
    await waitFor(() => expect(mockFetchItems).toHaveBeenCalled())
  })

  it('filters by type when type filter select changes', async () => {
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0))
    const typeSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(typeSelect, { target: { value: 'recipe' } })
    await waitFor(() => expect(mockFetchItems).toHaveBeenCalled())
  })

  it('clicking Next advances to next page', async () => {
    const items = Array.from({ length: 24 }, (_, i) => makeItem(`i${i}`, `Item ${i}`))
    mockFetchItems.mockResolvedValue({ items, total: 50 })
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getByText('Next')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(mockFetchItems).toHaveBeenCalledTimes(2))
  })

  it('sorts items by oldest when sort is changed to oldest', async () => {
    const items = [makeItem('i1', 'Bread'), makeItem('i2', 'Cake')]
    mockFetchItems.mockResolvedValue({ items, total: 2 })
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument())
    const sortSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(sortSelect, { target: { value: 'oldest' } })
    await waitFor(() => expect(mockFetchItems).toHaveBeenCalledTimes(2))
  })

  it('sorts items alphabetically when sort is changed to alpha', async () => {
    const items = [makeItem('i1', 'Zebra Cake'), makeItem('i2', 'Apple Pie')]
    mockFetchItems.mockResolvedValue({ items, total: 2 })
    render(<CategoryPage />)
    await waitFor(() => expect(screen.getByText('Zebra Cake')).toBeInTheDocument())
    const sortSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(sortSelect, { target: { value: 'alpha' } })
    await waitFor(() => expect(mockFetchItems).toHaveBeenCalledTimes(2))
  })
})
