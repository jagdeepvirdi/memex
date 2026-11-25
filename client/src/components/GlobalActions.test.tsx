import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../store/authStore', () => ({ useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }) }))
vi.mock('./search/SearchModal', () => ({ default: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Search mock"><button onClick={onClose}>Close search</button></div> }))
vi.mock('./ingest/IngestPanel', () => ({ default: ({ initialUrl, initialText, onCancel }: { initialUrl?: string; initialText?: string; onCancel: () => void }) => <div><output data-testid="initial-url">{initialUrl}</output><output data-testid="initial-text">{initialText}</output><button onClick={onCancel}>Cancel capture</button></div> }))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('../lib/api', () => ({ pingServer: vi.fn() }))
const addToOutbox = vi.hoisted(() => vi.fn())
vi.mock('../store/outboxStore', () => ({ useOutboxStore: { getState: () => ({ add: addToOutbox }) } }))

import { pingServer } from '../lib/api'
import { GlobalActions } from './GlobalActions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pingServer).mockResolvedValue(true)
  addToOutbox.mockResolvedValue({ ok: true, item: { id: 'x' } })
})

function renderActions(initialEntry = '/items/table') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><input aria-label="Filter items" /><GlobalActions /></MemoryRouter>)
}

describe('GlobalActions', () => {
  it('opens global search with slash and closes it on request', async () => {
    renderActions()
    fireEvent.keyDown(window, { key: '/' })
    expect(await screen.findByRole('dialog', { name: 'Search mock' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByRole('dialog', { name: 'Search mock' })).not.toBeInTheDocument()
  })

  it('does not steal shortcut keys from editable controls', () => {
    renderActions()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Filter items' }), { key: '/' })
    expect(screen.queryByRole('dialog', { name: 'Search mock' })).not.toBeInTheDocument()
  })

  it('opens capture globally, focuses a first control, and closes with Escape', async () => {
    renderActions()
    fireEvent.keyDown(window, { key: 'n' })
    expect(await screen.findByRole('button', { name: 'Cancel capture' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel capture' })).not.toBeInTheDocument())
  })

  it('opens with PWA shared text and URL prefilled', async () => {
    renderActions('/?share=true&title=Shared%20title&url=https%3A%2F%2Fexample.com')
    await waitFor(() => expect(screen.getByTestId('initial-url')).toHaveTextContent('https://example.com'))
    expect(screen.getByTestId('initial-text')).toBeEmptyDOMElement()
  })

  it('keeps a shared link for later, without opening the panel, when Memex cannot be reached', async () => {
    vi.mocked(pingServer).mockResolvedValue(false)
    renderActions('/?share=true&title=Some%20page&url=https%3A%2F%2Fexample.com%2Fa')
    await waitFor(() => expect(addToOutbox).toHaveBeenCalledWith('url', 'https://example.com/a'))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/not reachable.*Saved for later/))
    expect(screen.queryByRole('button', { name: 'Cancel capture' })).not.toBeInTheDocument()
  })

  it('keeps shared text for later as a note, and a link sent as text as a link', async () => {
    vi.mocked(pingServer).mockResolvedValue(false)
    renderActions('/?share=true&text=Stay%20at%20Lakeview%20Hotel')
    await waitFor(() => expect(addToOutbox).toHaveBeenCalledWith('text', 'Stay at Lakeview Hotel'))
  })

  it('treats a link shared in the text field as a link', async () => {
    vi.mocked(pingServer).mockResolvedValue(false)
    renderActions('/?share=true&text=https%3A%2F%2Fexample.com%2Fb')
    await waitFor(() => expect(addToOutbox).toHaveBeenCalledWith('url', 'https://example.com/b'))
  })

  it('opens the panel with what was shared when it cannot be kept for later', async () => {
    vi.mocked(pingServer).mockResolvedValue(false)
    addToOutbox.mockResolvedValue({ ok: false, message: '200 items are already waiting.' })
    renderActions('/?share=true&url=https%3A%2F%2Fexample.com%2Fc')
    await waitFor(() => expect(screen.getByTestId('initial-url')).toHaveTextContent('https://example.com/c'))
    expect(toast.error).toHaveBeenCalledWith('200 items are already waiting.')
  })

  it('does not keep anything for later when Memex answers', async () => {
    renderActions('/?share=true&url=https%3A%2F%2Fexample.com%2Fd')
    await waitFor(() => expect(screen.getByTestId('initial-url')).toHaveTextContent('https://example.com/d'))
    expect(addToOutbox).not.toHaveBeenCalled()
  })
})
