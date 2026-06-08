import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: ({ activeSection }: any) => <div data-testid="mock-sidebar">Sidebar: {activeSection}</div>,
}))

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

const mockFetchCategoryAnomalies = vi.fn()
const mockRemapCategory = vi.fn()
const mockFetchItems = vi.fn()
const mockUpdateItem = vi.fn()

vi.mock('../lib/api', () => ({
  fetchCategoryAnomalies: () => mockFetchCategoryAnomalies(),
  remapCategory: (id: string, path: string[]) => mockRemapCategory(id, path),
  fetchItems: (opts: any) => mockFetchItems(opts),
  updateItem: (id: string, updates: any) => mockUpdateItem(id, updates),
}))

import CategoryReviewPage from './CategoryReview'

describe('CategoryReviewPage Component', () => {
  const mockStagedItems = [
    { id: 'item1', title: 'Rogue Item 1', type: 'recipe', confidence: 65, intent: 'actionable', content: 'Item 1 content', categories: ['Food'], tags: [], source: 'manual', createdAt: new Date() },
    { id: 'item2', title: 'Rogue Item 2', type: 'note', confidence: 45, intent: 'idea', content: 'Item 2 content', categories: ['Ideas'], tags: [], source: 'manual', createdAt: new Date() },
  ]

  const mockAnomalies = [
    {
      id: 'anomaly1',
      name: 'RogueRoot',
      itemCount: 2,
      suggestedPath: ['Food', 'Bakery', 'Cakes'],
      previewItems: [
        { id: 'preview1', title: 'Preview Item 1', type: 'note' },
        { id: 'preview2', title: 'Preview Item 2', type: 'recipe' },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock resolves
    mockFetchItems.mockResolvedValue({ items: mockStagedItems, total: 2 })
    mockFetchCategoryAnomalies.mockResolvedValue(mockAnomalies)
    mockUpdateItem.mockResolvedValue({ success: true })
    mockRemapCategory.mockResolvedValue({ success: true })
  })

  it('renders staged items and handles individual Accept', async () => {
    render(<CategoryReviewPage />)

    // Verify initial load calls
    expect(mockFetchItems).toHaveBeenCalledWith({
      enriched: true,
      unreviewed: true,
      maxConfidence: 70,
      limit: 100,
    })

    // Wait for items to be in the DOM
    await waitFor(() => {
      expect(screen.getByText('Rogue Item 1')).toBeInTheDocument()
      expect(screen.getByText('Rogue Item 2')).toBeInTheDocument()
    })

    // Check custom badge values
    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.getByText('45%')).toBeInTheDocument()
    expect(screen.getByText('actionable')).toBeInTheDocument()
    expect(screen.getByText('idea')).toBeInTheDocument()

    // Click Accept on the first item
    const acceptBtns = screen.getAllByRole('button', { name: /accept/i })
    fireEvent.click(acceptBtns[0])

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('item1', { reviewed: true })
    })
  })

  it('handles reassigning an item to a new category', async () => {
    render(<CategoryReviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Rogue Item 1')).toBeInTheDocument()
    })

    // Click Reassign on the first item
    const reassignBtns = screen.getAllByRole('button', { name: /reassign/i })
    fireEvent.click(reassignBtns[0])

    // Verify input displays original categories
    const input = screen.getByPlaceholderText('Food › Bakery › Cakes')
    expect(input).toHaveValue('Food')

    // Change value and save
    fireEvent.change(input, { target: { value: 'Food / Bakery / Cakes' } })
    const saveBtn = screen.getByRole('button', { name: /save/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('item1', {
        categories: ['Food', 'Bakery', 'Cakes'],
        reviewed: true,
      })
    })
  })

  it('handles Accept All for staged items', async () => {
    render(<CategoryReviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Rogue Item 1')).toBeInTheDocument()
    })

    const acceptAllBtn = screen.getByRole('button', { name: /accept all/i })
    fireEvent.click(acceptAllBtn)

    await waitFor(() => {
      expect(mockUpdateItem).toHaveBeenCalledWith('item1', { reviewed: true })
      expect(mockUpdateItem).toHaveBeenCalledWith('item2', { reviewed: true })
    })
  })

  it('handles updating confidence threshold', async () => {
    render(<CategoryReviewPage />)

    await waitFor(() => {
      expect(screen.getByText('Rogue Item 1')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '90' } })

    await waitFor(() => {
      expect(mockFetchItems).toHaveBeenLastCalledWith({
        enriched: true,
        unreviewed: true,
        maxConfidence: 90,
        limit: 100,
      })
    })
  })

  it('navigates to anomalies tab, displays list, and supports remapping with AI suggestion', async () => {
    render(<CategoryReviewPage />)

    // Switch to anomalies tab
    const anomaliesTabBtn = screen.getByRole('button', { name: /category anomalies/i })
    fireEvent.click(anomaliesTabBtn)

    await waitFor(() => {
      expect(screen.getByText('"RogueRoot"')).toBeInTheDocument()
      expect(screen.getByText('Preview Item 1')).toBeInTheDocument()
    })

    // Click suggested button to set target path to AI recommendation
    const suggestedBtn = screen.getByRole('button', { name: /suggested/i })
    fireEvent.click(suggestedBtn)

    // Remap
    const remapBtn = screen.getByRole('button', { name: /remap/i })
    fireEvent.click(remapBtn)

    await waitFor(() => {
      expect(mockRemapCategory).toHaveBeenCalledWith('anomaly1', ['Food', 'Bakery', 'Cakes'])
      expect(screen.getByText('Done')).toBeInTheDocument()
    })
  })

  it('supports bulk remapping anomalies', async () => {
    const doubleAnomalies = [
      ...mockAnomalies,
      {
        id: 'anomaly2',
        name: 'AnotherRogue',
        itemCount: 3,
        suggestedPath: ['Tech', 'Laptops'],
        previewItems: [{ id: 'preview3', title: 'Preview Item 3', type: 'note' }],
      },
    ]
    mockFetchCategoryAnomalies.mockResolvedValue(doubleAnomalies)

    render(<CategoryReviewPage />)

    // Switch to anomalies tab
    const anomaliesTabBtn = screen.getByRole('button', { name: /category anomalies/i })
    fireEvent.click(anomaliesTabBtn)

    await waitFor(() => {
      expect(screen.getByText('"RogueRoot"')).toBeInTheDocument()
      expect(screen.getByText('"AnotherRogue"')).toBeInTheDocument()
    })

    // Click Remap All button in the header
    const remapAllBtn = screen.getByRole('button', { name: /remap all \(2\)/i })
    fireEvent.click(remapAllBtn)

    await waitFor(() => {
      expect(mockRemapCategory).toHaveBeenCalledWith('anomaly1', ['Food', 'Bakery', 'Cakes'])
      expect(mockRemapCategory).toHaveBeenCalledWith('anomaly2', ['Tech', 'Laptops'])
    })
  })
})
