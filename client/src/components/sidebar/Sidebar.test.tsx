import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockFetchCategories = vi.fn()
const mockFetchTags = vi.fn()

vi.mock('../../lib/api', () => ({
  fetchCategories: () => mockFetchCategories(),
  fetchTags: () => mockFetchTags(),
}))

import Sidebar from './Sidebar'

describe('Sidebar Component', () => {
  const mockCategories = [
    { id: 'cat1', name: 'Work', depth: 0, parentId: null, itemCount: 5 },
    { id: 'cat2', name: 'Personal', depth: 0, parentId: null, itemCount: 10 },
  ]

  const mockTags = [
    { name: 'todo', itemCount: 3 },
    { name: 'ideas', itemCount: 7 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchCategories.mockResolvedValue(mockCategories)
    mockFetchTags.mockResolvedValue(mockTags)
  })

  it('renders brand name and navigation items', async () => {
    render(<Sidebar activeSection="dashboard" />)

    expect(screen.getByText('Memex')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Weekly Digest')).toBeInTheDocument()
    expect(screen.getByText('Ask Knowledge')).toBeInTheDocument()
    expect(screen.getByText('Table View')).toBeInTheDocument()
    expect(screen.getByText('Places')).toBeInTheDocument()
    expect(screen.getByText('Media & Books')).toBeInTheDocument()
    expect(screen.getByText('Vault')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Trash')).toBeInTheDocument()
  })

  it('highlights the active section', () => {
    const { rerender } = render(<Sidebar activeSection="dashboard" />)
    const dashboardBtn = screen.getByText('Dashboard').closest('.cursor-pointer')!
    expect(dashboardBtn.className).toContain('bg-accent/10')
    expect(dashboardBtn.className).toContain('text-accent')

    rerender(<Sidebar activeSection="settings" />)
    const settingsBtn = screen.getByText('Settings').closest('.cursor-pointer')!
    expect(settingsBtn.className).toContain('bg-accent/10')
    expect(settingsBtn.className).toContain('text-accent')
  })

  it('handles navigation on click', () => {
    render(<Sidebar activeSection="dashboard" />)

    fireEvent.click(screen.getByText('Weekly Digest'))
    expect(mockNavigate).toHaveBeenCalledWith('/digest')

    fireEvent.click(screen.getByText('Table View'))
    expect(mockNavigate).toHaveBeenCalledWith('/items/table')
  })

  it('loads and displays categories and tags', async () => {
    render(<Sidebar activeSection="dashboard" />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('Personal')).toBeInTheDocument()
      expect(screen.getByText(/todo/)).toBeInTheDocument()
      expect(screen.getByText(/ideas/)).toBeInTheDocument()
    })
  })

  it('listens for memex:categories-changed event to refresh', async () => {
    render(<Sidebar activeSection="dashboard" />)
    expect(mockFetchCategories).toHaveBeenCalledTimes(1)

    // Trigger custom event
    fireEvent(window, new CustomEvent('memex:categories-changed'))

    await waitFor(() => {
      expect(mockFetchCategories).toHaveBeenCalledTimes(2)
    })
  })
})
