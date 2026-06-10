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

import PlacesView from './PlacesView'

const makePlaceItem = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id, title,
  type: 'place' as const,
  content: 'A great place',
  structured: {
    name: title,
    type: 'restaurant',
    city: 'Tokyo',
    country: 'Japan',
    visitStatus: 'visited',
    userRating: 4,
    cuisine: 'Japanese',
    mapsUrl: '',
  },
  source: 'manual' as const,
  reviewed: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  categories: ['Travel', 'Restaurants'],
  tags: ['food'],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchItems.mockResolvedValue({ items: [], total: 0 })
  mockUpdateItem.mockResolvedValue({})
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('PlacesView — initial render', () => {
  it('renders the Sidebar', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeInTheDocument())
  })

  it('renders the Places & Travel heading', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('Places & Travel')).toBeInTheDocument())
  })

  it('renders the Export CSV button', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('Export CSV')).toBeInTheDocument())
  })

  it('renders the search input', async () => {
    render(<PlacesView />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Search places/i)).toBeInTheDocument()
    )
  })

  it('renders table headers', async () => {
    render(<PlacesView />)
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Type')).toBeInTheDocument()
      expect(screen.getByText('City/Country')).toBeInTheDocument()
      expect(screen.getByText('Visit Status')).toBeInTheDocument()
      expect(screen.getByText('Rating')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })
  })
})

describe('PlacesView — loading state', () => {
  it('shows skeleton rows while loading', () => {
    mockFetchItems.mockReturnValue(new Promise(() => {}))
    render(<PlacesView />)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('PlacesView — empty state', () => {
  it('shows the "No places found" message', async () => {
    render(<PlacesView />)
    await waitFor(() =>
      expect(
        screen.getByText('No places found. Import more notes to extract intelligence.')
      ).toBeInTheDocument()
    )
  })

  it('shows 0 entries count badge', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('0 entries')).toBeInTheDocument())
  })
})

describe('PlacesView — with items', () => {
  beforeEach(() => {
    mockFetchItems.mockResolvedValue({
      items: [
        makePlaceItem('p1', 'Sukiyabashi Jiro'),
        makePlaceItem('p2', 'Narisawa'),
      ],
      total: 2,
    })
  })

  it('renders place names in the table', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('Sukiyabashi Jiro')).toBeInTheDocument())
    expect(screen.getByText('Narisawa')).toBeInTheDocument()
  })

  it('renders city/country', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getAllByText('Tokyo, Japan').length).toBeGreaterThan(0))
  })

  it('renders cuisine tags', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getAllByText('Japanese').length).toBeGreaterThan(0))
  })

  it('shows item count total', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('2 entries')).toBeInTheDocument())
  })

  it('renders the type badge', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getAllByText('restaurant').length).toBeGreaterThan(0))
  })

  it('renders visit status select dropdowns', async () => {
    render(<PlacesView />)
    await waitFor(() => {
      const selects = document.querySelectorAll('select')
      expect(selects.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows pagination count', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText(/Showing 1 to 2 of 2 items/)).toBeInTheDocument())
  })
})

describe('PlacesView — reset filters', () => {
  it('calls setSearchParams when Reset Filters is clicked', async () => {
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByTitle('Reset Filters')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Reset Filters'))
    expect(mockSetSearchParams).toHaveBeenCalled()
  })
})

describe('PlacesView — CSV export', () => {
  it('calls itemsToCsv and downloadCsv when Export CSV is clicked with items', async () => {
    mockFetchItems.mockResolvedValue({ items: [makePlaceItem('p1', 'Sushi Bar')], total: 1 })
    const { toast } = await import('sonner')
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('Sushi Bar')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Export CSV'))
    expect(mockItemsToCsv).toHaveBeenCalled()
    expect(mockDownloadCsv).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('CSV exported')
  })
})

describe('PlacesView — interactions', () => {
  it('navigates to item detail on place name click', async () => {
    mockFetchItems.mockResolvedValue({ items: [makePlaceItem('p1', 'Sukiyabashi Jiro')], total: 1 })
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('Sukiyabashi Jiro')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Sukiyabashi Jiro'))
    expect(mockNavigate).toHaveBeenCalledWith('/item/p1')
  })

  it('calls updateItem when a star rating is clicked', async () => {
    mockFetchItems.mockResolvedValue({ items: [makePlaceItem('p1', 'Sukiyabashi Jiro')], total: 1 })
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('Sukiyabashi Jiro')).toBeInTheDocument())
    const starButtons = document.querySelectorAll('td button')
    fireEvent.click(starButtons[0])
    await waitFor(() => expect(mockUpdateItem).toHaveBeenCalled())
  })

  it('calls updateItem when visit status changes', async () => {
    mockFetchItems.mockResolvedValue({ items: [makePlaceItem('p1', 'Sukiyabashi Jiro')], total: 1 })
    render(<PlacesView />)
    await waitFor(() => expect(screen.getByText('Sukiyabashi Jiro')).toBeInTheDocument())
    const select = document.querySelector('select')!
    fireEvent.change(select, { target: { value: 'want-to-revisit' } })
    await waitFor(() => expect(mockUpdateItem).toHaveBeenCalled())
  })
})
