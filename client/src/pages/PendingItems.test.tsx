import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockSearchParams = new URLSearchParams()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, vi.fn()],
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}))

vi.mock('../components/AppHeader', () => ({
  AppHeader: Object.assign(
    ({ left }: any) => <header data-testid="app-header">{left}</header>,
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
const mockDeleteItemsBulk = vi.fn()
vi.mock('../lib/api', () => ({
  fetchItems: (...a: any[]) => mockFetchItems(...a),
  deleteItemsBulk: (...a: any[]) => mockDeleteItemsBulk(...a),
}))

import PendingItemsPage from './PendingItems'

const makeItem = (id: string) => ({
  id, title: `Item ${id}`, type: 'note' as const, content: '',
  structured: {}, source: 'manual' as const, reviewed: false,
  createdAt: new Date(), updatedAt: new Date(), categories: [], tags: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchItems.mockResolvedValue({ items: [], total: 0 })
  mockDeleteItemsBulk.mockResolvedValue({ count: 0 })
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('PendingItemsPage — rendering', () => {
  it('renders the page heading', async () => {
    render(<PendingItemsPage />)
    expect(screen.getByText('Pending AI Enrichment')).toBeInTheDocument()
  })

  it('shows "All notes are enriched" when no items', async () => {
    render(<PendingItemsPage />)
    await waitFor(() =>
      expect(screen.getByText('All notes are enriched!')).toBeInTheDocument()
    )
  })

  it('renders item cards when there are pending items', async () => {
    mockFetchItems.mockResolvedValue({
      items: [makeItem('p1'), makeItem('p2')],
      total: 2,
    })
    render(<PendingItemsPage />)
    await waitFor(() => expect(screen.getByText('Item p1')).toBeInTheDocument())
    expect(screen.getByText('Item p2')).toBeInTheDocument()
  })

  it('shows skeleton loaders while loading', () => {
    // Mock fetch that never resolves during the test
    mockFetchItems.mockReturnValue(new Promise(() => {}))
    render(<PendingItemsPage />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('shows item count in the notes-waiting badge', async () => {
    mockFetchItems.mockResolvedValue({
      items: [makeItem('x1'), makeItem('x2'), makeItem('x3')],
      total: 3,
    })
    render(<PendingItemsPage />)
    await waitFor(() => expect(screen.getByText(/3 notes waiting/)).toBeInTheDocument())
  })
})
