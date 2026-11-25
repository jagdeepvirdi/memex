import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('../../lib/outboxSync', async (orig) => ({ ...(await orig<typeof import('../../lib/outboxSync')>()), flushOutbox: vi.fn() }))

import OutboxIndicator, { outboxLabel } from './OutboxIndicator'
import { useOutboxStore } from '../../store/outboxStore'
import { addToOutbox, listOutbox, updateOutboxItem } from '../../lib/outbox'
import { flushOutbox } from '../../lib/outboxSync'

const SUMMARY = { sent: 0, duplicates: 0, failed: 0, places: 0, remaining: 0 }

let online: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  vi.clearAllMocks()
  // The panel tests drive sending by hand; the automatic sending has its own tests below and is off while "offline".
  online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  useOutboxStore.setState({ items: [], flushing: false, lastResult: null })
})

describe('OutboxIndicator', () => {
  it('shows nothing when nothing is waiting', async () => {
    const { container } = render(<OutboxIndicator />)
    await waitFor(() => expect(useOutboxStore.getState().items).toEqual([]))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows how many items are waiting, then lists them', async () => {
    await addToOutbox('url', 'https://www.example.com/pine-valley')
    await addToOutbox('text', '<p>Stay at <b>Lakeview</b> Hotel</p>')
    render(<OutboxIndicator />)

    const button = await screen.findByRole('button', { name: /2 items saved on this device/i })
    expect(button).toHaveTextContent('2 waiting')
    fireEvent.click(button)

    const dialog = await screen.findByRole('dialog', { name: /saved for later/i })
    expect(dialog).toHaveTextContent('example.com/pine-valley')
    expect(dialog).toHaveTextContent('Stay at Lakeview Hotel')
    expect(screen.getByRole('button', { name: /Send 2 now/i })).toBeEnabled()
  })

  it('sends on request, reports the result, and refreshes the screen', async () => {
    await addToOutbox('url', 'https://example.com/a')
    const captured = vi.fn()
    window.addEventListener('memex:item-captured', captured)
    vi.mocked(flushOutbox).mockImplementation(async () => {
      // The send took the item out of the outbox.
      const [only] = await listOutbox()
      const { removeFromOutbox } = await import('../../lib/outbox')
      await removeFromOutbox(only.id)
      return { ...SUMMARY, sent: 1 }
    })
    render(<OutboxIndicator />)
    fireEvent.click(await screen.findByRole('button', { name: /saved on this device/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Send 1 now/i }))

    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 saved'))
    expect(captured).toHaveBeenCalled()
    window.removeEventListener('memex:item-captured', captured)
    // Everything went, so the button and the panel disappear.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /saved on this device/i })).not.toBeInTheDocument()
  })

  it('warns, and keeps the items, when Memex cannot be reached', async () => {
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(flushOutbox).mockResolvedValue({ ...SUMMARY, stoppedBecause: 'unreachable', remaining: 1 })
    render(<OutboxIndicator />)
    fireEvent.click(await screen.findByRole('button', { name: /saved on this device/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Send 1 now/i }))

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/not reachable.*1 still waiting/)))
    expect(await screen.findByRole('status')).toHaveTextContent(/not reachable/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('removes an item on request', async () => {
    await addToOutbox('url', 'https://example.com/a')
    await addToOutbox('url', 'https://example.com/b')
    render(<OutboxIndicator />)
    fireEvent.click(await screen.findByRole('button', { name: /2 items saved/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Remove from saved for later: example.com\/a/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).not.toHaveTextContent('example.com/a\n'))
    expect((await listOutbox()).map((i) => i.value)).toEqual(['https://example.com/b'])
  })

  it('shows why an item failed, can retry it, and sends only the waiting ones', async () => {
    const bad = await addToOutbox('url', 'https://example.com/bad')
    await addToOutbox('url', 'https://example.com/ok')
    await updateOutboxItem(bad.id, { status: 'failed', attempts: 3, lastError: 'Failed to ingest URL' })
    render(<OutboxIndicator />)

    const button = await screen.findByRole('button', { name: /could not be sent/i })
    fireEvent.click(button)
    expect(await screen.findByText(/Could not be saved: Failed to ingest URL/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send 1 now/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Try again: example.com\/bad/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Send 2 now/i })).toBeInTheDocument())
    expect((await listOutbox()).find((i) => i.id === bad.id)).toMatchObject({ status: 'waiting', attempts: 0 })
  })

  it('closes with Escape', async () => {
    await addToOutbox('url', 'https://example.com/a')
    render(<OutboxIndicator />)
    fireEvent.click(await screen.findByRole('button', { name: /saved on this device/i }))
    await screen.findByRole('dialog')
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('automatic sending', () => {
  const sentOne = async () => {
    const [only] = await listOutbox()
    const { removeFromOutbox } = await import('../../lib/outbox')
    if (only) await removeFromOutbox(only.id)
    return { ...SUMMARY, sent: 1 }
  }
  const settled = () => waitFor(() => expect(useOutboxStore.getState().flushing).toBe(false))

  it('sends by itself as soon as something is waiting, and tells you once it is saved', async () => {
    online.mockReturnValue(true)
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(flushOutbox).mockImplementation(sentOne)
    const captured = vi.fn()
    window.addEventListener('memex:item-captured', captured)
    render(<OutboxIndicator />)
    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 saved'))
    expect(captured).toHaveBeenCalled()
    window.removeEventListener('memex:item-captured', captured)
  })

  it('stays quiet and keeps the items when Memex is not reachable, and tries again when the network returns', async () => {
    online.mockReturnValue(true)
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(flushOutbox).mockResolvedValue({ ...SUMMARY, stoppedBecause: 'unreachable', remaining: 1 })
    render(<OutboxIndicator />)
    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(1))
    await settled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /saved on this device/i })).toBeInTheDocument()

    vi.mocked(flushOutbox).mockImplementation(sentOne)
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 saved'))
  })

  it('does not try while the phone has no network, or when nothing is waiting', async () => {
    await addToOutbox('url', 'https://example.com/a')
    const { unmount } = render(<OutboxIndicator />)
    await screen.findByRole('button', { name: /saved on this device/i })
    expect(flushOutbox).not.toHaveBeenCalled()
    unmount()

    globalThis.indexedDB = new IDBFactory()
    useOutboxStore.setState({ items: [] })
    online.mockReturnValue(true)
    render(<OutboxIndicator />)
    await waitFor(() => expect(useOutboxStore.getState().items).toEqual([]))
    expect(flushOutbox).not.toHaveBeenCalled()
  })

  it('tries again straight away when a new item is kept, even after a failed try', async () => {
    online.mockReturnValue(true)
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(flushOutbox).mockResolvedValue({ ...SUMMARY, stoppedBecause: 'unreachable', remaining: 1 })
    render(<OutboxIndicator />)
    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(1))
    await settled()
    await act(async () => { await useOutboxStore.getState().add('url', 'https://example.com/b') })
    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(2))
  })

  it('does not retry on a timer after the session ended, only when the app is opened again', async () => {
    online.mockReturnValue(true)
    await addToOutbox('url', 'https://example.com/a')
    vi.mocked(flushOutbox).mockResolvedValue({ ...SUMMARY, stoppedBecause: 'auth', remaining: 1 })
    render(<OutboxIndicator />)
    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(1))
    await settled()
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(flushOutbox).toHaveBeenCalledTimes(2))
  })
})

describe('outboxLabel', () => {
  const base = { id: 'x', createdAt: 1, status: 'waiting' as const, attempts: 0 }
  it('shows a link as host and path, and a note as its first words', () => {
    expect(outboxLabel({ ...base, kind: 'url', value: 'https://www.example.com/a/b?utm=1' })).toBe('example.com/a/b')
    expect(outboxLabel({ ...base, kind: 'url', value: 'https://example.com/' })).toBe('example.com')
    expect(outboxLabel({ ...base, kind: 'text', value: '<p>Hello&nbsp;world</p>' })).toBe('Hello world')
    expect(outboxLabel({ ...base, kind: 'text', value: 'x'.repeat(200) })).toHaveLength(81)
  })
})
