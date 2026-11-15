import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))
vi.mock('../../lib/api', () => ({ fetchItemEntities: vi.fn() }))

import ConnectedEntities, { roleLabel } from './ConnectedEntities'
import { fetchItemEntities } from '../../lib/api'
import type { ConnectedEntity } from '../../../../shared/types'

const CREATOR: ConnectedEntity = {
  id: 'e1', name: '@someone', type: 'person', roles: ['creator'], total: 7,
  others: [
    { id: 'a', title: 'Other repo', type: 'link' },
    { id: 'b', title: 'A prompt', type: 'link' },
  ],
}
const OWNER: ConnectedEntity = { id: 'e2', name: 'anthropics', type: 'organization', roles: ['owner'], total: 1, others: [{ id: 'c', title: 'Cookbook', type: 'link' }] }
const REPO: ConnectedEntity = { id: 'e3', name: 'anthropics/claude-code', type: 'other', roles: ['repo'], total: 0, others: [] }

beforeEach(() => vi.clearAllMocks())

describe('roleLabel', () => {
  it('turns roles into readable labels, joined, with a fallback for unknown ones', () => {
    expect(roleLabel(['creator'])).toBe('Shared by')
    expect(roleLabel(['director', 'cast'])).toBe('Director · Cast')
    expect(roleLabel(['mystery'])).toBe('mystery')
    expect(roleLabel([])).toBe('Linked')
  })
})

describe('ConnectedEntities', () => {
  it('renders nothing when the item has no links', async () => {
    vi.mocked(fetchItemEntities).mockResolvedValue([])
    const { container } = render(<ConnectedEntities itemId="item-1" />)
    await waitFor(() => expect(fetchItemEntities).toHaveBeenCalledWith('item-1'))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing, and no error, when the request fails', async () => {
    vi.mocked(fetchItemEntities).mockRejectedValue(new Error('boom'))
    const { container } = render(<ConnectedEntities itemId="item-1" />)
    await waitFor(() => expect(fetchItemEntities).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows each entity with its role and how many other items share it', async () => {
    vi.mocked(fetchItemEntities).mockResolvedValue([CREATOR, OWNER, REPO])
    render(<ConnectedEntities itemId="item-1" />)

    const rows = await screen.findAllByTestId('connected-entity')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('@someone')
    expect(rows[0]).toHaveTextContent('Shared by')
    expect(rows[0]).toHaveTextContent('7 other items')
    expect(rows[1]).toHaveTextContent('anthropics')
    expect(rows[1]).toHaveTextContent('Owner')
    expect(rows[1]).toHaveTextContent('1 other item') // singular
    expect(rows[1]).not.toHaveTextContent('1 other items')
    expect(rows[2]).toHaveTextContent('Repository')
    expect(rows[2]).toHaveTextContent('no other items')
  })

  it('links the other items, and says how many more there are beyond the sample', async () => {
    vi.mocked(fetchItemEntities).mockResolvedValue([CREATOR])
    render(<ConnectedEntities itemId="item-1" />)
    expect(await screen.findByRole('link', { name: 'Other repo' })).toHaveAttribute('href', '/item/a')
    expect(screen.getByRole('link', { name: 'A prompt' })).toHaveAttribute('href', '/item/b')
    expect(screen.getByText('+5 more')).toBeInTheDocument() // 7 total, 2 shown
  })

  it('does not show "more" when every sharing item is listed', async () => {
    vi.mocked(fetchItemEntities).mockResolvedValue([OWNER])
    render(<ConnectedEntities itemId="item-1" />)
    await screen.findByText('Cookbook')
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
  })

  it('reloads when the item changes and drops the previous item entities', async () => {
    vi.mocked(fetchItemEntities).mockResolvedValueOnce([CREATOR]).mockResolvedValueOnce([])
    const { rerender } = render(<ConnectedEntities itemId="item-1" />)
    await screen.findByText('@someone')
    rerender(<ConnectedEntities itemId="item-2" />)
    await waitFor(() => expect(fetchItemEntities).toHaveBeenLastCalledWith('item-2'))
    await waitFor(() => expect(screen.queryByText('@someone')).not.toBeInTheDocument())
  })

  it('ignores a slow response for an item the user has already left', async () => {
    let resolveFirst: (v: ConnectedEntity[]) => void = () => {}
    vi.mocked(fetchItemEntities)
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockResolvedValueOnce([OWNER])
    const { rerender } = render(<ConnectedEntities itemId="item-1" />)
    rerender(<ConnectedEntities itemId="item-2" />)
    await screen.findByText('anthropics')
    resolveFirst([CREATOR]) // arrives late
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByText('@someone')).not.toBeInTheDocument()
    expect(screen.getByText('anthropics')).toBeInTheDocument()
  })
})
