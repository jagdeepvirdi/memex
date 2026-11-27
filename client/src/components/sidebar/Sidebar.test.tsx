import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

const mockFetchCategories = vi.fn()
const mockFetchTags = vi.fn()
vi.mock('../../lib/api', () => ({
  fetchCategories: () => mockFetchCategories(),
  fetchTags: () => mockFetchTags(),
}))

import Sidebar from './Sidebar'

function RoutePath() {
  const location = useLocation()
  return <output data-testid="route-path">{location.pathname}</output>
}

function renderSidebar(activeSection: React.ComponentProps<typeof Sidebar>['activeSection'] = 'dashboard') {
  return render(<MemoryRouter><Sidebar activeSection={activeSection} /><RoutePath /></MemoryRouter>)
}

describe('Sidebar navigation', () => {
  const categories = [
    { id: 'cat1', name: 'Work', depth: 0, parentId: null, itemCount: 5, children: [{ id: 'child', name: 'Projects', depth: 1, parentId: 'cat1', itemCount: 2 }] },
    { id: 'cat2', name: 'Personal', depth: 0, parentId: null, itemCount: 10, children: [] },
  ]
  const tags = [{ name: 'todo', itemCount: 3 }, { name: 'ideas', itemCount: 7 }]

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchCategories.mockResolvedValue(categories)
    mockFetchTags.mockResolvedValue(tags)
  })

  it('renders all current destinations in the desktop navigation', () => {
    renderSidebar()
    const desktop = within(screen.getByRole('complementary', { name: 'Primary navigation' }))
    for (const label of ['Dashboard', 'Ask Knowledge', 'Knowledge Graph', 'Weekly Digest', 'Table View', 'Places', 'Media & Books', 'Vault', 'Pending Items', 'Enriched Items', 'Category Review', 'Trash', 'Settings']) {
      expect(desktop.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the active route and navigates to other destinations', () => {
    renderSidebar()
    const desktop = within(screen.getByRole('complementary', { name: 'Primary navigation' }))
    expect(desktop.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(desktop.getByRole('link', { name: 'Weekly Digest' }))
    expect(screen.getByTestId('route-path')).toHaveTextContent('/digest')
    fireEvent.click(desktop.getByRole('link', { name: 'Table View' }))
    expect(screen.getByTestId('route-path')).toHaveTextContent('/items/table')
  })

  it('loads category and tag destinations and expands nested categories accessibly', async () => {
    renderSidebar()
    const desktop = within(screen.getByRole('complementary', { name: 'Primary navigation' }))
    expect(await desktop.findByRole('link', { name: /Work/ })).toBeInTheDocument()
    const tagAction = desktop.getByRole('button', { name: /todo/ })
    expect(tagAction).toBeInTheDocument()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    fireEvent.click(tagAction)
    expect(dispatchSpy.mock.calls.some(([event]) => event.type === 'memex:open-search' && (event as CustomEvent).detail.tag === 'todo')).toBe(true)
    dispatchSpy.mockRestore()
    const expand = desktop.getByRole('button', { name: 'Expand Work' })
    fireEvent.click(expand)
    expect(desktop.getByRole('button', { name: 'Collapse Work' })).toHaveAttribute('aria-expanded', 'true')
    expect(desktop.getByRole('link', { name: /Projects/ })).toBeInTheDocument()
  })

  it('refreshes categories after the enrichment update event', async () => {
    renderSidebar()
    expect(mockFetchCategories).toHaveBeenCalledTimes(1)
    fireEvent(window, new CustomEvent('memex:categories-changed'))
    await waitFor(() => expect(mockFetchCategories).toHaveBeenCalledTimes(2))
  })

  it('opens the mobile menu and preserves category and settings navigation', async () => {
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const menu = screen.getByRole('dialog', { name: 'Navigation menu' })
    expect(within(menu).getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: /Work/ })).not.toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('button', { name: /Browse categories/ }))
    fireEvent.click(await within(menu).findByRole('link', { name: /Work/ }))
    expect(screen.getByTestId('route-path')).toHaveTextContent('/category/cat1')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument())
  })

  it('dismisses the mobile menu with Escape and restores focus to its trigger', async () => {
    renderSidebar()
    const trigger = screen.getByRole('button', { name: 'Open navigation menu' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
