import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mocks (must precede component import) ─────────────────────────────────────

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}))

vi.mock('../components/AppHeader', () => ({
  AppHeader: Object.assign(
    ({ left }: any) => <header data-testid="app-header">{left}</header>,
    { Spacer: () => <div data-testid="header-spacer" /> }
  ),
}))

vi.mock('../components/cards/ItemCard', () => ({
  default: ({ item }: any) => <div data-testid={`item-card-${item.id}`}>{item.title}</div>,
}))

const mockFetchItems = vi.fn()
const mockApiFetch = vi.fn()
vi.mock('../lib/api', () => ({
  fetchItems: (...args: any[]) => mockFetchItems(...args),
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}))

import TrashPage from './Trash'

const makeItem = (id: string, title: string) => ({
  id,
  title,
  type: 'note' as const,
  content: '',
  structured: {},
  source: 'manual' as const,
  reviewed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  categories: [],
  tags: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchItems.mockResolvedValue({ items: [], total: 0 })
  mockApiFetch.mockResolvedValue({ id: 'restored' })
})

// ── Smoke tests ───────────────────────────────────────────────────────────────

describe('TrashPage — rendering', () => {
  it('renders the Trash Bin heading', async () => {
    render(<TrashPage />)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByText('Trash Bin')).toBeInTheDocument()
  })

  it('shows the empty-trash state when no items', async () => {
    render(<TrashPage />)
    await waitFor(() => expect(screen.getByText('Trash is empty')).toBeInTheDocument())
  })

  it('renders item cards when deleted items exist', async () => {
    mockFetchItems.mockResolvedValue({
      items: [makeItem('del-1', 'Old Recipe'), makeItem('del-2', 'Forgotten Note')],
      total: 2,
    })
    render(<TrashPage />)
    await waitFor(() => expect(screen.getByText('Old Recipe')).toBeInTheDocument())
    expect(screen.getByText('Forgotten Note')).toBeInTheDocument()
  })

  it('shows the warning banner when items are present', async () => {
    mockFetchItems.mockResolvedValue({
      items: [makeItem('del-1', 'Stale Item')],
      total: 1,
    })
    render(<TrashPage />)
    await waitFor(() =>
      expect(screen.getByText(/excluded from search/i)).toBeInTheDocument()
    )
  })
})

describe('TrashPage — restore', () => {
  it('calls apiFetch PUT when restore is clicked', async () => {
    mockFetchItems.mockResolvedValue({
      items: [makeItem('del-1', 'Restore Me')],
      total: 1,
    })
    render(<TrashPage />)
    await waitFor(() => expect(screen.getByText('Restore Me')).toBeInTheDocument())

    // The restore button is inside a group-hover div — just find by title
    const restoreBtn = screen.getByTitle('Restore Item')
    fireEvent.click(restoreBtn)

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/items/del-1',
        expect.objectContaining({ method: 'PUT' })
      )
    )
  })

  it('removes the restored item from the list', async () => {
    const { toast } = await import('sonner')
    mockFetchItems.mockResolvedValue({
      items: [makeItem('del-1', 'Restore Me')],
      total: 1,
    })
    render(<TrashPage />)
    await waitFor(() => expect(screen.getByText('Restore Me')).toBeInTheDocument())

    fireEvent.click(screen.getByTitle('Restore Item'))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Item restored'))
    expect(screen.queryByText('Restore Me')).not.toBeInTheDocument()
  })
})

describe('TrashPage — error handling', () => {
  it('shows error toast when loading fails', async () => {
    const { toast } = await import('sonner')
    mockFetchItems.mockRejectedValue(new Error('DB error'))
    render(<TrashPage />)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load trash')
    )
  })
})
