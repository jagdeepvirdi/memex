import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockFetchItems = vi.fn()
const mockUpdateItem = vi.fn()
vi.mock('../lib/api', () => ({
  fetchItems: (...a: any[]) => mockFetchItems(...a),
  updateItem: (...a: any[]) => mockUpdateItem(...a),
}))

const mockItemsToCsv = vi.fn((..._a: any[]): string => 'csv-data')
const mockDownloadCsv = vi.fn((..._a: any[]): void => {})
vi.mock('../lib/export', () => ({
  itemsToCsv: (...a: any[]) => mockItemsToCsv(...a),
  downloadCsv: (...a: any[]) => mockDownloadCsv(...a),
}))

import MediaView from './MediaView'

const makeMediaItem = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id, title,
  type: 'media' as const,
  content: 'Some movie description',
  structured: { genre: 'Sci-Fi', director: 'Christopher Nolan', watchStatus: 'watched', userRating: 4 },
  source: 'manual' as const,
  reviewed: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  categories: ['Media', 'Movies'],
  tags: ['scifi'],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchItems.mockResolvedValue({ items: [], total: 0 })
  mockUpdateItem.mockResolvedValue({})
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('MediaView — initial render', () => {
  it('renders the Sidebar', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeInTheDocument())
  })

  it('renders the Media & Movies heading in media mode', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('Media & Movies')).toBeInTheDocument())
  })

  it('renders the Movies and Books tab buttons', async () => {
    render(<MediaView />)
    await waitFor(() => {
      expect(screen.getByText('Movies')).toBeInTheDocument()
      expect(screen.getByText('Books')).toBeInTheDocument()
    })
  })

  it('renders the Export CSV button', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('Export CSV')).toBeInTheDocument())
  })

  it('renders the search input', async () => {
    render(<MediaView />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/movies, directors/i)).toBeInTheDocument()
    )
  })

  it('renders table headers', async () => {
    render(<MediaView />)
    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Director')).toBeInTheDocument()
      expect(screen.getByText('Genre')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Rating')).toBeInTheDocument()
    })
  })
})

describe('MediaView — loading state', () => {
  it('shows skeleton rows while loading', () => {
    mockFetchItems.mockReturnValue(new Promise(() => {}))
    render(<MediaView />)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('MediaView — empty state', () => {
  it('shows "No media found." when there are no items', async () => {
    render(<MediaView />)
    await waitFor(() =>
      expect(screen.getByText('No media found.')).toBeInTheDocument()
    )
  })

  it('shows 0 items count badge', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('0 items')).toBeInTheDocument())
  })
})

describe('MediaView — with items', () => {
  beforeEach(() => {
    mockFetchItems.mockResolvedValue({
      items: [
        makeMediaItem('m1', 'Inception'),
        makeMediaItem('m2', 'The Dark Knight'),
      ],
      total: 2,
    })
  })

  it('renders item titles in the table', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('Inception')).toBeInTheDocument())
    expect(screen.getByText('The Dark Knight')).toBeInTheDocument()
  })

  it('renders the director field', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getAllByText('Christopher Nolan').length).toBeGreaterThan(0))
  })

  it('renders the genre field', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getAllByText('Sci-Fi').length).toBeGreaterThan(0))
  })

  it('shows item count badge with correct total', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('2 items')).toBeInTheDocument())
  })

  it('renders star buttons (5 stars per item)', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('Inception')).toBeInTheDocument())
    // 5 stars x 2 items = 10 star buttons
    const starButtons = document.querySelectorAll('td button[class*="transition-colors"]')
    expect(starButtons.length).toBeGreaterThanOrEqual(5)
  })

  it('shows Showing x to y of z items pagination text', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText(/Showing 1 to 2 of 2 items/)).toBeInTheDocument())
  })
})

describe('MediaView — CSV export', () => {
  it('calls itemsToCsv and downloadCsv when Export CSV is clicked with items', async () => {
    mockFetchItems.mockResolvedValue({ items: [makeMediaItem('m1', 'Inception')], total: 1 })
    const { toast } = await import('sonner')
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('Inception')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Export CSV'))
    expect(mockItemsToCsv).toHaveBeenCalled()
    expect(mockDownloadCsv).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('CSV exported')
  })

  it('does nothing when Export CSV is clicked with no items', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('No media found.')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Export CSV'))
    expect(mockItemsToCsv).not.toHaveBeenCalled()
  })
})

describe('MediaView — interactions', () => {
  it('navigates to item detail on row title click', async () => {
    mockFetchItems.mockResolvedValue({ items: [makeMediaItem('m1', 'Inception')], total: 1 })
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('Inception')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Inception'))
    expect(mockNavigate).toHaveBeenCalledWith('/item/m1')
  })

  it('calls setSearchParams when Reset Filters is clicked', async () => {
    render(<MediaView />)
    await waitFor(() => expect(screen.getByTitle('Reset Filters')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Reset Filters'))
    expect(mockSetSearchParams).toHaveBeenCalled()
  })

  it('calls updateItem when a star rating button is clicked', async () => {
    mockFetchItems.mockResolvedValue({ items: [makeMediaItem('m1', 'Inception')], total: 1 })
    render(<MediaView />)
    await waitFor(() => expect(screen.getByText('Inception')).toBeInTheDocument())
    const starButtons = document.querySelectorAll('td button')
    // Click first star in the rating group
    fireEvent.click(starButtons[0])
    await waitFor(() => expect(mockUpdateItem).toHaveBeenCalled())
  })
})
