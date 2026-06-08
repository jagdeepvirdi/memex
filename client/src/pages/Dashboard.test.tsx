import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock Subcomponents
vi.mock('../components/AppHeader', () => {
  const MockHeader = ({ left, actions }: any) => (
    <div data-testid="mock-app-header">
      <div data-testid="left-slot">{left}</div>
      <div data-testid="actions-slot">{actions}</div>
    </div>
  )
  MockHeader.Spacer = () => <div data-testid="mock-app-header-spacer" />
  return { AppHeader: MockHeader }
})

vi.mock('../components/ingest/IngestPanel', () => ({
  default: ({ onClose }: any) => (
    <div data-testid="mock-ingest-panel">
      <button onClick={onClose}>Close Ingest</button>
    </div>
  ),
}))

vi.mock('../components/search/SearchModal', () => ({
  default: ({ onClose }: any) => (
    <div data-testid="mock-search-modal">
      <button onClick={onClose}>Close Search</button>
    </div>
  ),
}))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: ({ activeSection }: any) => <div data-testid="mock-sidebar">Sidebar: {activeSection}</div>,
}))

vi.mock('../components/cards/ItemCard', () => ({
  default: ({ item }: any) => <div data-testid={`mock-item-card-${item.id}`}>Card: {item.title}</div>,
}))

vi.mock('../components/Skeleton', () => ({
  CardSkeleton: () => <div data-testid="mock-card-skeleton" />,
}))

// Mock API library
const mockFetchItems = vi.fn()
const mockFetchStats = vi.fn()
const mockFetchInsights = vi.fn()
const mockFetchRediscovery = vi.fn()

vi.mock('../lib/api', () => ({
  fetchItems: (...args: any[]) => mockFetchItems(...args),
  fetchStats: (...args: any[]) => mockFetchStats(...args),
  fetchInsights: (...args: any[]) => mockFetchInsights(...args),
  fetchRediscovery: (...args: any[]) => mockFetchRediscovery(...args),
}))

import Dashboard from './Dashboard'

describe('Dashboard Component', () => {
  const mockStats = {
    totalItems: 42,
    aiEnriched: 10,
    pendingAI: 5,
    totalVaultItems: 3,
    recentActivity: 8,
  }

  const mockItems = {
    items: [
      { id: '1', title: 'Item 1', type: 'note', content: 'Content 1', structured: {}, categories: [], tags: [], source: 'manual', createdAt: new Date() },
      { id: '2', title: 'Item 2', type: 'recipe', content: 'Content 2', structured: {}, categories: [], tags: [], source: 'manual', createdAt: new Date() },
    ],
    total: 2,
  }

  const mockInsights = [
    { id: '10', type: 'event', title: 'Insight Event', description: 'Event Description' },
    { id: '11', type: 'habit', title: 'Insight Habit', description: 'Habit Description' },
  ]

  const mockRediscovery = [
    { reason: 'Forgotten treasure', item: { id: '99', title: 'Old Note', type: 'note', content: 'Old content', structured: {}, categories: [], tags: [], source: 'keep', createdAt: new Date() } }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.delete('share')

    // Mock API implementations
    mockFetchItems.mockImplementation((params) => {
      if (params?.hasReminder) {
        return Promise.resolve({
          items: [
            { id: 'r1', title: 'Reminder Item', type: 'note', content: 'Content', structured: {}, categories: [], tags: [], source: 'manual', remindAt: new Date(Date.now() + 100000), createdAt: new Date() }
          ],
          total: 1
        })
      }
      return Promise.resolve(mockItems)
    })
    mockFetchStats.mockResolvedValue(mockStats)
    mockFetchInsights.mockResolvedValue(mockInsights)
    mockFetchRediscovery.mockResolvedValue(mockRediscovery)
  })

  it('renders stats, insights, rediscovery items, and items correctly', async () => {
    render(<Dashboard />)

    // Verify loading state is shown initially (optional/brief)
    expect(screen.queryByTestId('mock-sidebar')).toBeInTheDocument()

    // Wait for async load
    await waitFor(() => {
      expect(screen.getByText('Total Items')).toBeInTheDocument()
    })

    // Verify stats
    expect(screen.getByText('42')).toBeInTheDocument() // totalItems
    expect(screen.getByText('10')).toBeInTheDocument() // aiEnriched
    expect(screen.getByText('5 pending')).toBeInTheDocument() // pendingAI
    expect(screen.getByText('3')).toBeInTheDocument() // totalVaultItems
    expect(screen.getByText('8')).toBeInTheDocument() // recentActivity

    // Verify insights
    expect(screen.getByText('Insight Event')).toBeInTheDocument()
    expect(screen.getByText('Insight Habit')).toBeInTheDocument()

    // Verify rediscovery items
    expect(screen.getByText('Forgotten treasure')).toBeInTheDocument()
    expect(screen.getByText('Card: Old Note')).toBeInTheDocument()

    // Verify reminders
    expect(screen.getByText('Reminder Item')).toBeInTheDocument()

    // Verify items list
    expect(screen.getByTestId('mock-item-card-1')).toBeInTheDocument()
    expect(screen.getByTestId('mock-item-card-2')).toBeInTheDocument()
  })

  it('navigates to intelligence map when CTA button is clicked', async () => {
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Open Intelligence Map')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Open Intelligence Map'))
    expect(mockNavigate).toHaveBeenCalledWith('/graph')
  })

  it('can open search modal by clicking search field', async () => {
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Search everything...')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Search everything...'))
    expect(screen.getByTestId('mock-search-modal')).toBeInTheDocument()

    // Can close search modal
    fireEvent.click(screen.getByText('Close Search'))
    expect(screen.queryByTestId('mock-search-modal')).not.toBeInTheDocument()
  })

  it('opens keyboard shortcuts guide when shortcuts button or "?" is clicked', async () => {
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByTitle('Keyboard Shortcuts')).toBeInTheDocument())

    fireEvent.click(screen.getByTitle('Keyboard Shortcuts'))
    expect(screen.getByText('Shortcuts')).toBeInTheDocument()

    // Can close keyboard shortcuts guide
    fireEvent.click(screen.getByRole('button', { name: /close shortcuts/i }))
    expect(screen.queryByText('Shortcuts')).not.toBeInTheDocument()
  })

  it('handles keyboard shortcuts', async () => {
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Total Items')).toBeInTheDocument())

    // Ctrl+N for Ingest panel
    fireEvent.keyDown(window, { ctrlKey: true, key: 'n' })
    expect(screen.getByTestId('mock-ingest-panel')).toBeInTheDocument()

    // Ctrl+K for Search modal
    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' })
    expect(screen.getByTestId('mock-search-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-ingest-panel')).not.toBeInTheDocument()

    // Escape to close search modal
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('mock-search-modal')).not.toBeInTheDocument()

    // "?" key to toggle shortcuts
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByText('Shortcuts')).toBeInTheDocument()
  })
})
