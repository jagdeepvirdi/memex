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

vi.mock('../lib/api', () => ({
  fetchItems: (...args: any[]) => mockFetchItems(...args),
  updateItem: (...args: any[]) => mockUpdateItem(...args),
  migrateToVault: (...args: any[]) => mockMigrateToVault(...args),
  nlFilter: (...args: any[]) => mockNlFilter(...args),
  deleteItem: (...args: any[]) => mockDeleteItem(...args),
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
