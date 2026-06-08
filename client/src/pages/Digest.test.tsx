import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    section: ({ children, ...p }: any) => <section {...p}>{children}</section>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
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

const mockFetchDigest = vi.fn()
vi.mock('../lib/api', () => ({
  fetchDigest: (...a: any[]) => mockFetchDigest(...a),
}))

import DigestPage from './Digest'

const makeItem = (id: string, title: string) => ({
  id, title, type: 'note' as const, content: '',
  structured: {}, source: 'manual' as const, reviewed: true,
  createdAt: new Date(), updatedAt: new Date(),
  categories: [], tags: [],
})

const makeDigest = (overrides: Record<string, unknown> = {}) => ({
  period: 'June 2–8, 2025',
  weekCount: 0,
  prevWeekCount: 0,
  recentItems: [],
  onThisDay: null,
  connection: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchDigest.mockResolvedValue(makeDigest())
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('DigestPage — rendering', () => {
  it('renders the Weekly Digest heading', async () => {
    render(<DigestPage />)
    await waitFor(() => expect(screen.getByText('Weekly Digest')).toBeInTheDocument())
  })

  it('shows loading spinner before data arrives', () => {
    mockFetchDigest.mockReturnValue(new Promise(() => {}))
    render(<DigestPage />)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows period subtitle when loaded', async () => {
    render(<DigestPage />)
    await waitFor(() => expect(screen.getByText('June 2–8, 2025')).toBeInTheDocument())
  })

  it('shows This Week count', async () => {
    mockFetchDigest.mockResolvedValue(makeDigest({ weekCount: 7 }))
    render(<DigestPage />)
    await waitFor(() => {
      expect(screen.getByText('This Week')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
    })
  })

  it('renders recent items as cards', async () => {
    mockFetchDigest.mockResolvedValue(makeDigest({
      recentItems: [makeItem('i1', 'Best Recipe'), makeItem('i2', 'Top Book')],
      weekCount: 2,
    }))
    render(<DigestPage />)
    await waitFor(() => expect(screen.getByText('Best Recipe')).toBeInTheDocument())
    expect(screen.getByText('Top Book')).toBeInTheDocument()
  })

  it('shows "Nothing saved this week" when recentItems is empty', async () => {
    render(<DigestPage />)
    await waitFor(() =>
      expect(screen.getByText('Nothing saved this week')).toBeInTheDocument()
    )
  })
})

describe('DigestPage — refresh', () => {
  it('calls fetchDigest again when Regenerate is clicked', async () => {
    render(<DigestPage />)
    await waitFor(() => expect(screen.getByText('Regenerate')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Regenerate'))
    await waitFor(() => expect(mockFetchDigest).toHaveBeenCalledTimes(2))
  })
})
