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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockApiFetch = vi.fn()
const mockFetchInsights = vi.fn()
vi.mock('../lib/api', () => ({
  apiFetch: (...a: any[]) => mockApiFetch(...a),
  fetchInsights: (...a: any[]) => mockFetchInsights(...a),
}))

import WelcomePage from './Welcome'

beforeEach(() => {
  vi.clearAllMocks()
  mockApiFetch.mockResolvedValue({})
  mockFetchInsights.mockResolvedValue([])
})

// ── Step 1 ────────────────────────────────────────────────────────────────────

describe('WelcomePage — step 1', () => {
  it('renders the Hello, World. heading on step 1', () => {
    render(<WelcomePage />)
    expect(screen.getByText('Hello, World.')).toBeInTheDocument()
  })

  it('renders the "Let\'s get started" button', () => {
    render(<WelcomePage />)
    expect(screen.getByText(/let's get started/i)).toBeInTheDocument()
  })

  it('advances to step 2 when the CTA button is clicked', () => {
    render(<WelcomePage />)
    fireEvent.click(screen.getByText(/let's get started/i))
    expect(screen.getByText('Choose My Persona')).toBeInTheDocument()
  })
})

// ── Step 2 ────────────────────────────────────────────────────────────────────

describe('WelcomePage — step 2', () => {
  const goToStep2 = () => {
    render(<WelcomePage />)
    fireEvent.click(screen.getByText(/let's get started/i))
  }

  it('shows persona options', () => {
    goToStep2()
    expect(screen.getByText('Helpful Productivity Partner')).toBeInTheDocument()
    expect(screen.getByText('Inspirational Creative Muse')).toBeInTheDocument()
  })

  it('can navigate back to step 1', () => {
    goToStep2()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Hello, World.')).toBeInTheDocument()
  })

  it('starts fetching insights when step 2 mounts', async () => {
    goToStep2()
    await waitFor(() => expect(mockFetchInsights).toHaveBeenCalled())
  })

  it('selects productivity persona on click', () => {
    goToStep2()
    const productivityBtn = screen.getByText('Helpful Productivity Partner').closest('button')!
    fireEvent.click(productivityBtn)
    expect(productivityBtn).toBeInTheDocument()
  })

  it('Continue button is enabled after selecting a persona', () => {
    goToStep2()
    fireEvent.click(screen.getByText('Helpful Productivity Partner').closest('button')!)
    const continueBtn = screen.getByText('Continue').closest('button')!
    expect(continueBtn).not.toBeDisabled()
  })
})

// ── Step 3 ────────────────────────────────────────────────────────────────────

describe('WelcomePage — step 3 / completion', () => {
  const goToStep3 = () => {
    render(<WelcomePage />)
    fireEvent.click(screen.getByText(/let's get started/i))
    // Select a persona to enable Continue
    fireEvent.click(screen.getByText('Inspirational Creative Muse').closest('button')!)
    fireEvent.click(screen.getByText('Continue').closest('button')!)
  }

  it('shows "Enter My Memex" button on step 3', () => {
    goToStep3()
    expect(screen.getByText(/enter my memex/i)).toBeInTheDocument()
  })

  it('calls apiFetch to save persona and navigates to / on complete', async () => {
    const { toast } = await import('sonner')
    goToStep3()
    fireEvent.click(screen.getByText(/enter my memex/i))
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ method: 'PUT' })
    ))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
    expect(toast.success).toHaveBeenCalledWith('Welcome to Memex!')
  })
})
