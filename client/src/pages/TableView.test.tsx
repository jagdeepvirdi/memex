import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

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

vi.mock('../components/sidebar/Sidebar', () => ({
  default: ({ activeSection }: any) => <div data-testid="mock-sidebar">Sidebar: {activeSection}</div>,
}))

// Mock Vault Store & Crypto
vi.mock('../store/vaultStore', () => ({
  useVaultStore: () => ({
    vaultKey: 'test-key',
    isLocked: false,
  }),
}))

vi.mock('../lib/crypto', () => ({
  encryptVaultItem: () => Promise.resolve({ ciphertext: 'cipher', iv: 'iv' }),
}))

// Mock API library
const mockFetchItems = vi.fn()
const mockUpdateItem = vi.fn()
const mockMigrateToVault = vi.fn()
const mockNlFilter = vi.fn()
const mockDeleteItem = vi.fn()
const mockSetItemsPriority = vi.fn()

vi.mock('../lib/api', () => ({
  fetchItems: (...args: any[]) => mockFetchItems(...args),
  updateItem: (...args: any[]) => mockUpdateItem(...args),
  migrateToVault: (...args: any[]) => mockMigrateToVault(...args),
  nlFilter: (...args: any[]) => mockNlFilter(...args),
  deleteItem: (...args: any[]) => mockDeleteItem(...args),
  setItemsPriority: (...args: any[]) => mockSetItemsPriority(...args),
}))

import TableView from './TableView'

describe('TableView Component', () => {
  const mockItems = {
    items: [
      { id: '1', title: 'Work Note', type: 'note', content: 'Work content', structured: {}, categories: ['Work'], tags: ['office'], source: 'manual', createdAt: new Date() },
      { id: '2', title: 'Cake Recipe', type: 'recipe', content: 'Sweet cake', structured: {}, categories: ['Food'], tags: ['sweet'], source: 'manual', createdAt: new Date() },
    ],
    total: 2,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchItems.mockResolvedValue(mockItems)
    window.confirm = vi.fn().mockReturnValue(true)
  })

  it('renders Sidebar, AppHeader, filters, and items table correctly', async () => {
    render(<TableView />)

    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('mock-app-header')).toBeInTheDocument()

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Work Note')).toBeInTheDocument()
      expect(screen.getByText('Cake Recipe')).toBeInTheDocument()
    })

    // Verify filter dropdowns exist
    expect(screen.getByText('All Types')).toBeInTheDocument()
    expect(screen.getByText('All Status')).toBeInTheDocument()
  })

  it('handles type filter changes', async () => {
    render(<TableView />)
    await waitFor(() => expect(screen.getByText('Work Note')).toBeInTheDocument())

    // Target the Type selector
    const typeSelect = screen.getByDisplayValue('All Types')
    fireEvent.change(typeSelect, { target: { value: 'recipe' } })

    expect(mockSetSearchParams).toHaveBeenCalled()
  })

  it('allows natural language search mode toggle and execution', async () => {
    render(<TableView />)
    await waitFor(() => expect(screen.getByText('Work Note')).toBeInTheDocument())

    // Toggle NL Mode
    const nlBtn = screen.getByText('Ask AI')
    fireEvent.click(nlBtn)

    const input = screen.getByPlaceholderText(/Thai restaurants/i)
    fireEvent.change(input, { target: { value: 'recipes' } })

    mockNlFilter.mockResolvedValue({
      items: [mockItems.items[1]],
      total: 1,
      parsedFilter: { type: 'recipe', searchQuery: '', structuredFilters: {} }
    })

    // Click submit/send button
    const sendBtn = screen.getByPlaceholderText(/Thai restaurants/i).nextSibling!.firstChild! as HTMLElement
    fireEvent.click(sendBtn || screen.getByPlaceholderText(/Thai restaurants/i))

    await waitFor(() => {
      expect(mockNlFilter).toHaveBeenCalledWith('recipes')
    })
  })

  it('handles item review action click', async () => {
    render(<TableView />)
    await waitFor(() => expect(screen.getByText('Work Note')).toBeInTheDocument())

    mockUpdateItem.mockResolvedValue({})
    const reviewBtn = screen.getAllByTitle('Mark Reviewed')[0]
    fireEvent.click(reviewBtn)

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('1', { reviewed: true })
    })
  })

  it('handles item migration to vault click', async () => {
    render(<TableView />)
    await waitFor(() => expect(screen.getByText('Work Note')).toBeInTheDocument())

    mockMigrateToVault.mockResolvedValue({})
    const vaultBtn = screen.getAllByTitle('Move to Secure Vault')[0]
    fireEvent.click(vaultBtn)

    await waitFor(() => {
      expect(mockMigrateToVault).toHaveBeenCalledWith('1', {
        service: 'Work Note',
        url: undefined,
        ciphertext: 'cipher',
        iv: 'iv',
      })
    })
  })

  it('handles item delete action click', async () => {
    render(<TableView />)
    await waitFor(() => expect(screen.getByText('Work Note')).toBeInTheDocument())

    mockDeleteItem.mockResolvedValue({})
    const deleteBtn = screen.getAllByTitle('Delete')[0]
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockDeleteItem).toHaveBeenCalledWith('1')
    })
  })
})

// ── Priority triage ───────────────────────────────────────────────────────────

describe('TableView — priority triage', () => {
  const triageItems = {
    items: [
      { id: '1', title: 'Alpha repo', type: 'link', content: '', structured: {}, categories: [], tags: [], source: 'manual', priority: 'essential', createdAt: new Date() },
      { id: '2', title: 'Beta repo', type: 'link', content: '', structured: {}, categories: [], tags: [], source: 'manual', createdAt: new Date() },
      { id: '3', title: 'Gamma repo', type: 'link', content: '', structured: {}, categories: [], tags: [], source: 'manual', priority: 'skip', createdAt: new Date() },
    ],
    total: 3,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.delete('priority')
    mockFetchItems.mockResolvedValue(triageItems)
    mockSetItemsPriority.mockResolvedValue({ count: 2 })
  })

  const load = async () => {
    render(<TableView />)
    await screen.findByText('Alpha repo')
  }
  const pick = (title: string) => fireEvent.click(screen.getByRole('checkbox', { name: `Select ${title}` }))

  it('shows each item priority as a badge, and a dash when not triaged', async () => {
    await load()
    const badges = screen.getAllByTestId('priority-badge')
    expect(badges.map(b => b.textContent)).toEqual(['Essential', 'Skip'])
  })

  it('has no bulk bar until something is selected', async () => {
    await load()
    expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument()
    pick('Alpha repo')
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent('1 selected')
  })

  it('selects and deselects every row from the header checkbox', async () => {
    await load()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all items on this page' }))
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent('3 selected')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all items on this page' }))
    expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument()
  })

  it('"Deselect all" clears the selection', async () => {
    await load()
    pick('Alpha repo'); pick('Beta repo')
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument()
  })

  it('sets the priority on the selected items only, updates the rows and clears the selection', async () => {
    await load()
    pick('Beta repo'); pick('Gamma repo')
    fireEvent.click(within(screen.getByTestId('bulk-bar')).getByRole('button', { name: 'Useful' }))

    await waitFor(() => expect(mockSetItemsPriority).toHaveBeenCalledWith(['2', '3'], 'useful'))
    await waitFor(() => expect(screen.getAllByTestId('priority-badge').map(b => b.textContent)).toEqual(['Essential', 'Useful', 'Useful']))
    expect(screen.queryByTestId('bulk-bar')).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Marked 2 items as Useful')
  })

  it('highlights a priority in the picker only when every selected item shares it', async () => {
    await load()
    pick('Alpha repo')
    expect(within(screen.getByTestId('bulk-bar')).getByRole('button', { name: 'Essential' })).toHaveAttribute('aria-pressed', 'true')
    pick('Gamma repo')
    expect(within(screen.getByTestId('bulk-bar')).getByRole('button', { name: 'Essential' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('"Clear priority" sends null', async () => {
    await load()
    pick('Alpha repo'); pick('Gamma repo')
    fireEvent.click(screen.getByRole('button', { name: 'Clear priority' }))
    await waitFor(() => expect(mockSetItemsPriority).toHaveBeenCalledWith(['1', '3'], null))
    await waitFor(() => expect(screen.queryByTestId('priority-badge')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Cleared priority on 2 items')
  })

  it('keeps the selection and reports an error if the update fails', async () => {
    mockSetItemsPriority.mockRejectedValue(new Error('boom'))
    await load()
    pick('Beta repo')
    fireEvent.click(within(screen.getByTestId('bulk-bar')).getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update priority'))
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent('1 selected')
    expect(screen.queryAllByTestId('priority-badge')).toHaveLength(2) // Beta unchanged
  })

  it('passes the priority filter to the query and updates the URL', async () => {
    mockSearchParams.set('priority', 'none')
    await load()
    expect(mockFetchItems.mock.calls[0][0]).toMatchObject({ priority: 'none' })
    fireEvent.change(screen.getByLabelText('Priority filter'), { target: { value: 'essential' } })
    const params = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0] as URLSearchParams
    expect(params.get('priority')).toBe('essential')
  })

  it('omits the priority filter when set to any', async () => {
    await load()
    expect(mockFetchItems.mock.calls[0][0].priority).toBeUndefined()
  })

  it('drops items that no longer match an active priority filter', async () => {
    mockSearchParams.set('priority', 'none')
    const beta = triageItems.items[1]
    const delta = { ...beta, id: '4', title: 'Delta repo' }
    mockFetchItems.mockResolvedValue({ items: [beta, delta], total: 2 })
    render(<TableView />)
    await screen.findByText('Beta repo')
    expect(screen.getByText('2 items')).toBeInTheDocument()

    pick('Beta repo')
    fireEvent.click(within(screen.getByTestId('bulk-bar')).getByRole('button', { name: 'Essential' }))

    await waitFor(() => expect(screen.queryByText('Beta repo')).not.toBeInTheDocument())
    expect(screen.getByText('Delta repo')).toBeInTheDocument()
    expect(screen.getByText('1 items')).toBeInTheDocument()
    expect(mockSetItemsPriority).toHaveBeenCalledWith(['2'], 'essential')
  })

  it('removes an item cleared of the priority it was filtered by', async () => {
    mockSearchParams.set('priority', 'essential')
    mockFetchItems.mockResolvedValue({ items: [triageItems.items[0]], total: 1 })
    render(<TableView />)
    await screen.findByText('Alpha repo')
    pick('Alpha repo')
    fireEvent.click(screen.getByRole('button', { name: 'Clear priority' }))
    await waitFor(() => expect(mockSetItemsPriority).toHaveBeenCalledWith(['1'], null))
    await waitFor(() => expect(screen.queryByText('Alpha repo')).not.toBeInTheDocument())
  })
})
