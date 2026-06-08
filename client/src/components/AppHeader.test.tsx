import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockLogout = vi.fn()
vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({
    user: { email: 'testuser@example.com' },
    logout: mockLogout,
  }),
}))

const mockUseAiStatus = vi.fn()
vi.mock('../hooks/useAiStatus', () => ({
  useAiStatus: () => mockUseAiStatus(),
}))

import { AppHeader } from './AppHeader'

describe('AppHeader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementation
    mockUseAiStatus.mockReturnValue({
      aiStatus: 'ok',
      enrichment: { total: 0, pending: 0 },
      eta: null,
      isOnline: true,
    })
  })

  it('renders left slot content and actions slot content', () => {
    render(
      <AppHeader
        left={<div data-testid="left-content">Left Side</div>}
        actions={<button data-testid="action-btn">Action</button>}
      />
    )

    expect(screen.getByTestId('left-content')).toHaveTextContent('Left Side')
    expect(screen.getByTestId('action-btn')).toHaveTextContent('Action')
  })

  it('displays user profile trigger and opens profile menu on click', () => {
    render(<AppHeader left={<div>Title</div>} />)

    const profileTrigger = screen.getByText('T') // First letter of email 'testuser@example.com'
    expect(profileTrigger).toBeInTheDocument()

    // Profile menu should be hidden initially
    expect(screen.queryByText('Logout')).not.toBeInTheDocument()

    // Open profile menu
    fireEvent.click(profileTrigger)
    expect(screen.getByText('testuser@example.com')).toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument()

    // Clicking logout calls logout and navigates to login page
    fireEvent.click(screen.getByText('Logout'))
    expect(mockLogout).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('shows correct network status online vs offline', () => {
    // Online state
    const { rerender } = render(<AppHeader left={<div>Title</div>} />)
    expect(screen.getByText('ONLINE')).toBeInTheDocument()

    // Offline state
    mockUseAiStatus.mockReturnValue({
      aiStatus: 'ok',
      enrichment: { total: 0, pending: 0 },
      eta: null,
      isOnline: false,
    })
    rerender(<AppHeader left={<div>Title</div>} />)
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
  })

  it('shows correct AI (Ollama) status indicators', () => {
    // READY (aiStatus: 'ok')
    const { rerender } = render(<AppHeader left={<div>Title</div>} />)
    expect(screen.getByText('READY')).toBeInTheDocument()

    // WAIT (aiStatus: 'loading')
    mockUseAiStatus.mockReturnValue({
      aiStatus: 'loading',
      enrichment: { total: 0, pending: 0 },
      eta: null,
      isOnline: true,
    })
    rerender(<AppHeader left={<div>Title</div>} />)
    expect(screen.getByText('WAIT')).toBeInTheDocument()

    // OFFLINE (aiStatus: 'error')
    mockUseAiStatus.mockReturnValue({
      aiStatus: 'error',
      enrichment: { total: 0, pending: 0 },
      eta: null,
      isOnline: true,
    })
    rerender(<AppHeader left={<div>Title</div>} />)
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
  })

  it('shows enrichment progress bar when enrichment tasks are pending', () => {
    mockUseAiStatus.mockReturnValue({
      aiStatus: 'ok',
      enrichment: { total: 10, pending: 4 },
      eta: '1m 20s',
      isOnline: true,
    })
    render(<AppHeader left={<div>Title</div>} />)

    expect(screen.getByText('6/10')).toBeInTheDocument()
    expect(screen.getByText('1m 20s')).toBeInTheDocument()
  })

  it('shows checkmark when all items are successfully enriched', () => {
    mockUseAiStatus.mockReturnValue({
      aiStatus: 'ok',
      enrichment: { total: 15, pending: 0 },
      eta: null,
      isOnline: true,
    })
    render(<AppHeader left={<div>Title</div>} />)

    expect(screen.getByText('15 classified')).toBeInTheDocument()
  })
})
