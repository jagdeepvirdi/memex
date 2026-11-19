import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../store/authStore', () => ({ useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }) }))
vi.mock('./search/SearchModal', () => ({ default: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Search mock"><button onClick={onClose}>Close search</button></div> }))
vi.mock('./ingest/IngestPanel', () => ({ default: ({ initialUrl, initialText, onCancel }: { initialUrl?: string; initialText?: string; onCancel: () => void }) => <div><output data-testid="initial-url">{initialUrl}</output><output data-testid="initial-text">{initialText}</output><button onClick={onCancel}>Cancel capture</button></div> }))

import { GlobalActions } from './GlobalActions'

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
})
