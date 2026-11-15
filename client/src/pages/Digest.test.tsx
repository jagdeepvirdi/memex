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

// ── Priority triage ───────────────────────────────────────────────────────────

describe('DigestPage — priority', () => {
  const priorityDigest = (over: Record<string, unknown> = {}) => makeDigest({
    weekCount: 6,
    recentItems: [makeItem('r1', 'Recent one')],
    byPriority: {
      counts: { essential: 7, useful: 2, skip: 1, untriaged: 3 },
      essential: [makeItem('e1', 'Must read repo'), makeItem('e2', 'Key prompt')],
      useful: [makeItem('u1', 'Handy tool')],
    },
    ...over,
  })

  it('shows the weekly priority counts', async () => {
    mockFetchDigest.mockResolvedValue(priorityDigest())
    render(<DigestPage />)
    const block = await screen.findByTestId('digest-priority')
    expect(block).toHaveTextContent('Essential 7')
    expect(block).toHaveTextContent('Useful 2')
    expect(block).toHaveTextContent('Skip 1')
  })

  it('lists essential items as cards and useful items as links', async () => {
    mockFetchDigest.mockResolvedValue(priorityDigest())
    render(<DigestPage />)
    expect(await screen.findByText('Essential this week')).toBeInTheDocument()
    expect(screen.getByTestId('item-e1')).toHaveTextContent('Must read repo')
    expect(screen.getByTestId('item-e2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Handy tool' }))
    expect(mockNavigate).toHaveBeenCalledWith('/item/u1')
  })

  it('offers a triage shortcut when items are untriaged', async () => {
    mockFetchDigest.mockResolvedValue(priorityDigest())
    render(<DigestPage />)
    fireEvent.click(await screen.findByRole('button', { name: /3 to triage/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/items/table?priority=none')
  })

  it('links to the full essential list when there are more than shown', async () => {
    mockFetchDigest.mockResolvedValue(priorityDigest())
    render(<DigestPage />)
    fireEvent.click(await screen.findByRole('button', { name: /See all 7 essential/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/items/table?priority=essential')
  })

  it('does not offer "see all" when every essential item is already shown', async () => {
    mockFetchDigest.mockResolvedValue(priorityDigest({
      byPriority: { counts: { essential: 2, useful: 0, skip: 0, untriaged: 0 }, essential: [makeItem('e1', 'A'), makeItem('e2', 'B')], useful: [] },
    }))
    render(<DigestPage />)
    await screen.findByText('Essential this week')
    expect(screen.queryByRole('button', { name: /See all/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Also useful')).not.toBeInTheDocument()
  })

  it('says so when everything is triaged, with no triage button', async () => {
    mockFetchDigest.mockResolvedValue(priorityDigest({
      byPriority: { counts: { essential: 0, useful: 0, skip: 0, untriaged: 0 }, essential: [], useful: [] },
    }))
    render(<DigestPage />)
    expect(await screen.findByText('Everything this week is triaged')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /to triage/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Essential this week')).not.toBeInTheDocument()
  })

  it('hides the section when nothing was saved this week', async () => {
    mockFetchDigest.mockResolvedValue(priorityDigest({ weekCount: 0, recentItems: [] }))
    render(<DigestPage />)
    await screen.findByText('Nothing saved this week')
    expect(screen.queryByTestId('digest-priority')).not.toBeInTheDocument()
  })

  it('still renders when the response has no byPriority (older cached response)', async () => {
    mockFetchDigest.mockResolvedValue(makeDigest({ weekCount: 1, recentItems: [makeItem('r1', 'Recent one')] }))
    render(<DigestPage />)
    expect(await screen.findByText('Recent one')).toBeInTheDocument()
    expect(screen.queryByTestId('digest-priority')).not.toBeInTheDocument()
  })
})
