import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockFetchSearch = vi.fn()
const mockFetchTaggedItems = vi.fn()
let mockSemantic = true
vi.mock('../../lib/api', () => ({
  fetchSearchResult: async (q: string) => ({ items: await mockFetchSearch(q), semantic: mockSemantic }),
  fetchItems: (...args: any[]) => mockFetchTaggedItems(...args),
}))

import SearchModal from './SearchModal'

describe('SearchModal Component', () => {
  const mockOnClose = vi.fn()
  const mockItems = [
    { id: 'item1', title: 'Coffee Recipe', type: 'recipe', content: 'Use beans', structured: {}, categories: [], tags: [], source: 'manual', createdAt: new Date() },
    { id: 'item2', title: 'React Hooks Spec', type: 'spec', content: 'useState details', structured: {}, categories: [], tags: [], source: 'manual', createdAt: new Date() },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockSemantic = true
    mockFetchSearch.mockResolvedValue(mockItems)
    mockFetchTaggedItems.mockResolvedValue({ items: mockItems, total: mockItems.length })
  })

  it('renders input field and placeholder', () => {
    render(<SearchModal onClose={mockOnClose} />)

    expect(screen.getByPlaceholderText('Search items, notes, recipes...')).toBeInTheDocument()
    expect(screen.getByText('Start typing to search...')).toBeInTheDocument()
  })

  it('triggers onClose when clicking close button or background overlay', () => {
    const { container } = render(<SearchModal onClose={mockOnClose} />)

    // Click backdrop overlay
    const overlay = container.firstChild!
    fireEvent.click(overlay)
    expect(mockOnClose).toHaveBeenCalledTimes(1)

    // Click close button
    const closeBtn = screen.getByRole('button', { name: /close search/i })
    fireEvent.click(closeBtn)
    expect(mockOnClose).toHaveBeenCalledTimes(2)
  })

  it('debounces and fetches search results when user types', async () => {
    render(<SearchModal onClose={mockOnClose} />)

    const input = screen.getByPlaceholderText('Search items, notes, recipes...')
    fireEvent.change(input, { target: { value: 'React' } })

    // Wait for debounce timeout (~300ms)
    await waitFor(() => {
      expect(mockFetchSearch).toHaveBeenCalledWith('React')
    })

    // Verify search results render
    await waitFor(() => {
      expect(screen.getByText('Coffee Recipe')).toBeInTheDocument()
      expect(screen.getByText('React Hooks Spec')).toBeInTheDocument()
    })
  })

  it('navigates and closes on selecting a search result', async () => {
    render(<SearchModal onClose={mockOnClose} />)

    const input = screen.getByPlaceholderText('Search items, notes, recipes...')
    fireEvent.change(input, { target: { value: 'Spec' } })

    await waitFor(() => {
      expect(screen.getByText('React Hooks Spec')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('React Hooks Spec'))
    expect(mockNavigate).toHaveBeenCalledWith('/item/item2')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('supports ArrowDown/ArrowUp and Enter key navigation', async () => {
    render(<SearchModal onClose={mockOnClose} />)

    const input = screen.getByPlaceholderText('Search items, notes, recipes...')
    fireEvent.change(input, { target: { value: 'test' } })

    await waitFor(() => {
      expect(screen.getByText('Coffee Recipe')).toBeInTheDocument()
    })

    // Press ArrowDown to highlight second item
    fireEvent.keyDown(window, { key: 'ArrowDown' })

    // Wait for state and DOM updates to propagate
    await waitFor(() => {
      const options = screen.getByRole('listbox', { name: 'Search results' }).querySelectorAll('[role="option"]')
      expect(options[1]).toHaveAttribute('aria-selected', 'true')
    })

    // Press Enter to select highlighted item
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(mockNavigate).toHaveBeenCalledWith('/item/item2')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('tells the user when results are keyword matches only', async () => {
    mockSemantic = false
    render(<SearchModal onClose={mockOnClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search items, notes, recipes...'), { target: { value: 'coffee' } })
    expect(await screen.findByText(/keyword matches only/i)).toBeInTheDocument()
    expect(screen.getByText('Coffee Recipe')).toBeInTheDocument()
  })

  it('shows no notice when search is semantic', async () => {
    render(<SearchModal onClose={mockOnClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search items, notes, recipes...'), { target: { value: 'coffee' } })
    await screen.findByText('Coffee Recipe')
    expect(screen.queryByText(/keyword matches only/i)).not.toBeInTheDocument()
  })

  it('opens a tag shortcut as an exact tag filter', async () => {
    render(<SearchModal onClose={mockOnClose} initialTag="coffee" />)
    expect(await screen.findByText('Coffee Recipe')).toBeInTheDocument()
    expect(mockFetchTaggedItems).toHaveBeenCalledWith({ tag: 'coffee', type: undefined, limit: 20 })
    expect(screen.getByText('Tag: coffee')).toBeInTheDocument()
  })

  it('supports Escape key to close modal', () => {
    render(<SearchModal onClose={mockOnClose} />)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })
})
