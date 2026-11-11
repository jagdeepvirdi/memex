import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks (must precede component import) ─────────────────────────────────────

const mockNavigate = vi.fn()
let mockLocationState: unknown = null
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockLogin = vi.fn()
let mockIsAuthenticated = false
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: any) => any) => {
    const state = {
      login: mockLogin,
      logout: vi.fn(),
      isAuthenticated: mockIsAuthenticated,
      user: null,
      token: null,
    }
    return selector ? selector(state) : state
  },
}))

const mockApiFetch = vi.fn()
vi.mock('../lib/api', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}))

import LoginPage from './Login'

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated = false
  mockLocationState = null
  mockApiFetch.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' }, token: 'tok' })
})

// ── Smoke tests ───────────────────────────────────────────────────────────────

describe('LoginPage — rendering', () => {
  it('renders the Memex logo and title', () => {
    render(<LoginPage />)
    expect(screen.getByText('Memex')).toBeInTheDocument()
  })

  it('shows Sign In form by default', () => {
    render(<LoginPage />)
    expect(screen.getByText('Sign In')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email Address')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('shows Enter Workspace submit button in sign-in mode', () => {
    render(<LoginPage />)
    expect(screen.getByText('Enter Workspace')).toBeInTheDocument()
  })

  it('has the toggle button to switch to setup mode', () => {
    render(<LoginPage />)
    expect(screen.getByText(/new installation/i)).toBeInTheDocument()
  })
})

describe('LoginPage — setup mode toggle', () => {
  it('switches to Setup Workspace view when toggle is clicked', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText(/new installation/i))
    expect(screen.getByText('Setup Workspace')).toBeInTheDocument()
  })

  it('shows AI verification panel in setup mode', () => {
    mockApiFetch.mockResolvedValue({ status: 'ok' })
    render(<LoginPage />)
    fireEvent.click(screen.getByText(/new installation/i))
    expect(screen.getByText(/Local AI Verification/i)).toBeInTheDocument()
  })

  it('shows Already have an account toggle in setup mode', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText(/new installation/i))
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument()
  })

  it('toggles back to sign-in when already-have-account is clicked', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText(/new installation/i))
    fireEvent.click(screen.getByText(/already have an account/i))
    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })
})

describe('LoginPage — form submission (login mode)', () => {
  it('calls apiFetch /auth/login when form is submitted', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email Address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret' },
    })
    fireEvent.click(screen.getByText('Enter Workspace'))
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({ method: 'POST' })
    ))
  })

  it('calls login() with user and token on success', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email Address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret' },
    })
    fireEvent.click(screen.getByText('Enter Workspace'))
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith(
      { id: 'u1', email: 'a@b.com' },
      'tok'
    ))
  })

  it('navigates to / after successful login', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email Address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret' },
    })
    fireEvent.click(screen.getByText('Enter Workspace'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  it('calls toast.error on login failure', async () => {
    const { toast } = await import('sonner')
    mockApiFetch.mockRejectedValue(new Error('Invalid credentials'))
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email Address'), {
      target: { value: 'bad@user.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByText('Enter Workspace'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'))
  })

  it('redirects to / immediately when already authenticated', () => {
    mockIsAuthenticated = true
    render(<LoginPage />)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

// ── Return to the page the user was on ────────────────────────────────────────

describe('LoginPage — returning to the previous page', () => {
  const signIn = () => {
    fireEvent.change(screen.getByPlaceholderText('Email Address'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByText('Enter Workspace'))
  }

  it('returns to the page (with query string) the user was redirected from', async () => {
    mockLocationState = { from: { pathname: '/item/42', search: '?tab=notes', hash: '#top' } }
    render(<LoginPage />)
    signIn()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/item/42?tab=notes#top'))
  })

  it('goes to / when there is no previous page', async () => {
    render(<LoginPage />)
    signIn()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  it('never redirects back to /login itself', async () => {
    mockLocationState = { from: { pathname: '/login' } }
    render(<LoginPage />)
    signIn()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
    expect(mockNavigate).not.toHaveBeenCalledWith('/login')
  })

  it('sends a new account to /welcome regardless of the previous page', async () => {
    mockLocationState = { from: { pathname: '/item/42' } }
    // Setup mode is gated on the Ollama health check, then posts to /auth/setup.
    mockApiFetch.mockImplementation(async (path: string) =>
      path === '/health/ollama' ? { status: 'ok' } : { user: { id: 'u1', email: 'a@b.com' }, token: 'tok' })
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Is this a new installation? Setup here'))
    await waitFor(() => expect(screen.getByText('Initialize Memex').closest('button')).not.toBeDisabled())
    fireEvent.change(screen.getByPlaceholderText('Email Address'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByText('Initialize Memex'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/welcome'))
  })

  it('returns an already-signed-in user to the previous page', () => {
    mockIsAuthenticated = true
    mockLocationState = { from: { pathname: '/vault' } }
    render(<LoginPage />)
    expect(mockNavigate).toHaveBeenCalledWith('/vault')
  })
})
