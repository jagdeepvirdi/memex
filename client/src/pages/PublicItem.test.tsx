import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'share-tok-abc' }),
}))

const mockFetchSharedItem = vi.fn()
vi.mock('../lib/api', () => ({
  fetchSharedItem: (...a: any[]) => mockFetchSharedItem(...a),
}))

import PublicItemPage from './PublicItem'

const makeItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'pub-1',
  title: 'Shared Thai Recipe',
  type: 'recipe' as const,
  content: 'Soak rice noodles, add pad thai sauce.',
  structured: { cuisine: 'Thai', servings: '2', summary: 'A classic noodle dish.' },
  source: 'manual' as const,
  reviewed: true,
  createdAt: new Date('2024-06-01'),
  updatedAt: new Date('2024-06-01'),
  categories: ['Food', 'Savory', 'Thai'],
  tags: ['noodles', 'thai'],
  sourceUrl: 'https://example.com/recipe',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchSharedItem.mockResolvedValue(makeItem())
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('PublicItemPage — branding', () => {
  it('renders the Memex Shared Item header', async () => {
    render(<PublicItemPage />)
    await waitFor(() => expect(screen.getByText(/Memex · Shared Item/)).toBeInTheDocument())
  })
})

describe('PublicItemPage — loading state', () => {
  it('shows loading spinner while fetching', () => {
    mockFetchSharedItem.mockReturnValue(new Promise(() => {}))
    render(<PublicItemPage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})

describe('PublicItemPage — error state', () => {
  it('shows not found message on error', async () => {
    mockFetchSharedItem.mockRejectedValue(new Error('Link expired'))
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Item not found')).toBeInTheDocument()
    )
  })

  it('shows expiry hint text', async () => {
    mockFetchSharedItem.mockRejectedValue(new Error('expired'))
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText(/expired or sharing may have been revoked/i)).toBeInTheDocument()
    )
  })
})

describe('PublicItemPage — item display', () => {
  it('renders the item title', async () => {
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Shared Thai Recipe')).toBeInTheDocument()
    )
  })

  it('renders the type badge', async () => {
    render(<PublicItemPage />)
    await waitFor(() => expect(screen.getByText('recipe')).toBeInTheDocument())
  })

  it('renders the item content', async () => {
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText(/Soak rice noodles/)).toBeInTheDocument()
    )
  })

  it('renders the AI summary in a blockquote', async () => {
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText('A classic noodle dish.')).toBeInTheDocument()
    )
  })

  it('renders tags with # prefix', async () => {
    render(<PublicItemPage />)
    await waitFor(() => {
      expect(screen.getByText('#noodles')).toBeInTheDocument()
      expect(screen.getByText('#thai')).toBeInTheDocument()
    })
  })

  it('renders the category breadcrumb', async () => {
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Food › Savory › Thai')).toBeInTheDocument()
    )
  })

  it('renders the original source link', async () => {
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText('Original source')).toBeInTheDocument()
    )
  })

  it('renders structured data details table', async () => {
    render(<PublicItemPage />)
    await waitFor(() => expect(screen.getByText('cuisine')).toBeInTheDocument())
    expect(screen.getByText('Thai')).toBeInTheDocument()
  })

  it('renders the shared-via footer text', async () => {
    render(<PublicItemPage />)
    await waitFor(() =>
      expect(screen.getByText(/Shared via Memex/)).toBeInTheDocument()
    )
  })
})
