import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }))

vi.mock('../../lib/api', () => ({
  fetchDemoStatus: vi.fn(),
  loadDemoData: vi.fn(),
  clearDemoData: vi.fn(),
}))

import { fetchDemoStatus, loadDemoData, clearDemoData } from '../../lib/api'
import { useDemoStore } from '../../store/demoStore'
import { SampleDataPanel } from './SampleDataPanel'
import { DemoBanner } from '../DemoBanner'

const notify = { success: vi.fn(), error: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  useDemoStore.setState({ items: null, busy: false })
})

describe('SampleDataPanel', () => {
  it('offers to load sample data when there is none, and says no AI is called', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 0 })
    render(<SampleDataPanel notify={notify} />)
    expect(await screen.findByText('Try Memex with sample data')).toBeInTheDocument()
    expect(screen.getByText(/No AI is called/)).toBeInTheDocument()
  })

  it('loads the sample data and says how many items it added', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 0 })
    vi.mocked(loadDemoData).mockResolvedValue({ items: 40 })
    render(<SampleDataPanel notify={notify} />)
    fireEvent.click(await screen.findByRole('button', { name: /Load sample data/ }))
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Loaded 40 sample items'))
    expect(await screen.findByText('Sample data is loaded (40 items)')).toBeInTheDocument()
  })

  it('shows the server reason when loading fails', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 0 })
    vi.mocked(loadDemoData).mockRejectedValue(new Error('Sample data is already loaded. Clear it first to load it again.'))
    render(<SampleDataPanel notify={notify} />)
    fireEvent.click(await screen.findByRole('button', { name: /Load sample data/ }))
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Sample data is already loaded. Clear it first to load it again.'))
  })

  it('asks before clearing, and does nothing if you keep it', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 40 })
    render(<SampleDataPanel notify={notify} />)
    fireEvent.click(await screen.findByRole('button', { name: /Clear sample data/ }))
    expect(clearDemoData).not.toHaveBeenCalled()
    expect(screen.getByText('Sample data is loaded (40 items)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.getByRole('button', { name: /Clear sample data/ })).toBeInTheDocument()
    expect(clearDemoData).not.toHaveBeenCalled()
  })

  it('clears after confirming and then offers to load again', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 40 })
    vi.mocked(clearDemoData).mockResolvedValue({ items: 40, entities: 9, tags: 20 })
    render(<SampleDataPanel notify={notify} />)
    fireEvent.click(await screen.findByRole('button', { name: /Clear sample data/ }))
    fireEvent.click(screen.getByRole('button', { name: /Yes, clear the sample data/ }))
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Removed 40 sample items'))
    expect(await screen.findByText('Try Memex with sample data')).toBeInTheDocument()
  })

  it('falls back to a plain message when clearing fails without one', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 40 })
    vi.mocked(clearDemoData).mockRejectedValue(new Error(''))
    render(<SampleDataPanel notify={notify} />)
    fireEvent.click(await screen.findByRole('button', { name: /Clear sample data/ }))
    fireEvent.click(screen.getByRole('button', { name: /Yes, clear/ }))
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Could not clear the sample data'))
  })
})

describe('DemoBanner', () => {
  it('shows nothing while sample data is not loaded', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 0 })
    render(<DemoBanner />)
    await waitFor(() => expect(fetchDemoStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument()
  })

  it('shows nothing when the check fails', async () => {
    vi.mocked(fetchDemoStatus).mockRejectedValue(new Error('offline'))
    render(<DemoBanner />)
    await waitFor(() => expect(fetchDemoStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument()
  })

  it('shows Demo mode while sample items are loaded, and leads to where they are cleared', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 40 })
    render(<DemoBanner />)
    const banner = await screen.findByTestId('demo-banner')
    expect(banner).toHaveTextContent('Demo mode')
    fireEvent.click(banner)
    expect(mockNavigate).toHaveBeenCalledWith('/settings/library')
  })

  it('disappears once the sample data is cleared', async () => {
    vi.mocked(fetchDemoStatus).mockResolvedValue({ items: 40 })
    vi.mocked(clearDemoData).mockResolvedValue({ items: 40, entities: 0, tags: 0 })
    render(<DemoBanner />)
    await screen.findByTestId('demo-banner')
    await useDemoStore.getState().clear()
    await waitFor(() => expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument())
  })
})
