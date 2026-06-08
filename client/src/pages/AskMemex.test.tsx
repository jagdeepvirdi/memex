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
    span: ({ children, ...p }: any) => <span {...p}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}))

vi.mock('../components/AppHeader', () => ({
  AppHeader: Object.assign(
    ({ left }: any) => <header data-testid="app-header">{left}</header>,
    { Spacer: () => <div /> }
  ),
}))

const mockAskKnowledge = vi.fn()
vi.mock('../lib/api', () => ({
  askKnowledge: (...a: any[]) => mockAskKnowledge(...a),
}))

import AskMemexPage from './AskMemex'

beforeEach(() => {
  vi.clearAllMocks()
  mockAskKnowledge.mockResolvedValue({ answer: 'The answer is 42.', sources: [] })
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('AskMemexPage — rendering', () => {
  it('renders the Ask My Knowledge heading', () => {
    render(<AskMemexPage />)
    expect(screen.getByText('Ask My Knowledge')).toBeInTheDocument()
  })

  it('renders the text input with correct placeholder', () => {
    render(<AskMemexPage />)
    expect(screen.getByPlaceholderText('Ask anything about your data...')).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    render(<AskMemexPage />)
    const submitBtn = document.querySelector('button[type="submit"]')
    expect(submitBtn).toBeInTheDocument()
  })

  it('shows the empty state greeting when no messages', () => {
    render(<AskMemexPage />)
    expect(screen.getByText("Hello, I'm Memex.")).toBeInTheDocument()
  })

  it('shows suggestion chips in the empty state', () => {
    render(<AskMemexPage />)
    expect(screen.getByText(/thai restaurant recommendations/i)).toBeInTheDocument()
  })
})

describe('AskMemexPage — form submission', () => {
  it('calls askKnowledge when the form is submitted', async () => {
    render(<AskMemexPage />)
    const input = screen.getByPlaceholderText('Ask anything about your data...')
    fireEvent.change(input, { target: { value: 'What are my top recipes?' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(mockAskKnowledge).toHaveBeenCalledWith('What are my top recipes?')
    )
  })

  it('displays the AI response after a successful ask', async () => {
    render(<AskMemexPage />)
    const input = screen.getByPlaceholderText('Ask anything about your data...')
    fireEvent.change(input, { target: { value: 'What is Memex?' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(screen.getByText('The answer is 42.')).toBeInTheDocument()
    )
  })

  it('clears the input after submitting', async () => {
    render(<AskMemexPage />)
    const input = screen.getByPlaceholderText('Ask anything about your data...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'A question?' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('does not call askKnowledge when input is empty', () => {
    render(<AskMemexPage />)
    fireEvent.submit(document.querySelector('form')!)
    expect(mockAskKnowledge).not.toHaveBeenCalled()
  })

  it('shows an error message in chat when askKnowledge fails', async () => {
    mockAskKnowledge.mockRejectedValue(new Error('Ollama offline'))
    render(<AskMemexPage />)
    const input = screen.getByPlaceholderText('Ask anything about your data...')
    fireEvent.change(input, { target: { value: 'A question?' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(screen.getByText(/encountered an error/i)).toBeInTheDocument()
    )
  })
})
