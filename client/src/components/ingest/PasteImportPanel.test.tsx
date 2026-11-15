import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))
vi.mock('../../lib/api', () => ({
  previewPasteImport: vi.fn(),
  startPasteImport: vi.fn(),
  fetchIngestJob: vi.fn(),
}))

import PasteImportPanel from './PasteImportPanel'
import { previewPasteImport, startPasteImport, fetchIngestJob } from '../../lib/api'
import type { PasteImportResponse } from '../../lib/api'

const ENTRIES: PasteImportResponse['entries'] = [
  { index: 0, title: 'https://github.com/a/new', source: 'url', status: 'saved' },
  { index: 1, title: 'https://github.com/a/seen', source: 'url', status: 'skipped', reason: 'already-saved', existingId: 'old-1', existingTitle: 'Seen' },
  { index: 2, title: 'https://github.com/a/new', source: 'url', status: 'skipped', reason: 'duplicate-in-paste' },
]
const PLAN: PasteImportResponse = { dryRun: true, total: 3, new: 1, skipped: 2, entries: ENTRIES }
const STARTED: PasteImportResponse = { dryRun: false, total: 3, new: 1, skipped: 2, saved: 1, jobId: 'job-1', entries: ENTRIES }

const box = () => screen.getByLabelText('Paste links, captions or notes')
const type = (v: string) => fireEvent.change(box(), { target: { value: v } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(previewPasteImport).mockResolvedValue(PLAN)
  vi.mocked(startPasteImport).mockResolvedValue(STARTED)
})
afterEach(() => vi.useRealTimers())

describe('PasteImportPanel — compose and preview', () => {
  it('disables Preview and Import until there is text and a preview', () => {
    render(<PasteImportPanel />)
    expect(screen.getByRole('button', { name: /preview/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
    type('https://github.com/a/new')
    expect(screen.getByRole('button', { name: /preview/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })

  it('previews without importing, showing counts, skip reasons and a link to the existing item', async () => {
    render(<PasteImportPanel />)
    type('x')
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    const plan = await screen.findByTestId('paste-plan')
    expect(previewPasteImport).toHaveBeenCalledWith('x')
    expect(startPasteImport).not.toHaveBeenCalled()
    expect(plan).toHaveTextContent('1 to import')
    expect(plan).toHaveTextContent('2 skipped')
    expect(screen.getAllByTestId('entry-new')).toHaveLength(1)
    expect(screen.getAllByTestId('entry-skipped')).toHaveLength(2)
    expect(plan).toHaveTextContent('Already in Memex')
    expect(plan).toHaveTextContent('Repeated in this paste')
    expect(screen.getByRole('link', { name: 'view' })).toHaveAttribute('href', '/item/old-1')
    expect(screen.getByRole('button', { name: 'Import 1 item' })).toBeEnabled()
  })

  it('drops a stale preview when the text changes', async () => {
    render(<PasteImportPanel />)
    type('x')
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('paste-plan')
    type('x and more')
    expect(screen.queryByTestId('paste-plan')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })

  it('disables Import when everything would be skipped', async () => {
    vi.mocked(previewPasteImport).mockResolvedValue({ ...PLAN, new: 0, skipped: 3 })
    render(<PasteImportPanel />)
    type('x')
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('paste-plan')
    expect(screen.getByRole('button', { name: /import 0 items/i })).toBeDisabled()
  })

  it('shows the server error when preview fails', async () => {
    vi.mocked(previewPasteImport).mockRejectedValue(new Error('Too many entries (201). Import at most 200 at a time.'))
    render(<PasteImportPanel />)
    type('x')
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many entries (201)')
    expect(screen.queryByTestId('paste-plan')).not.toBeInTheDocument()
  })
})

describe('PasteImportPanel — import and progress', () => {
  async function startImport() {
    render(<PasteImportPanel />)
    type('x')
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('paste-plan')
    fireEvent.click(screen.getByRole('button', { name: /import 1 item/i }))
    await screen.findByTestId('paste-result')
  }

  it('imports the same text and shows the saved/skipped summary', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'processing', progress: 0, total: 1, completed: 0 })
    await startImport()
    expect(startPasteImport).toHaveBeenCalledWith('x')
    expect(screen.getByTestId('paste-result')).toHaveTextContent('1 saved, 2 skipped')
  })

  it('polls the job until it finishes, then stops polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(fetchIngestJob)
      .mockResolvedValueOnce({ status: 'processing', progress: 50, total: 2, completed: 1 })
      .mockResolvedValue({ status: 'completed', progress: 100, total: 2, completed: 2, details: { classified: 2, failed: [] } })
    await startImport()

    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(screen.getByText('AI classification')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    await waitFor(() => expect(screen.getByText('Classification finished')).toBeInTheDocument())

    const calls = vi.mocked(fetchIngestJob).mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(vi.mocked(fetchIngestJob).mock.calls.length).toBe(calls)
    expect(vi.mocked(fetchIngestJob)).toHaveBeenCalledWith('job-1')
  })

  it('lists items that could not be classified', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(fetchIngestJob).mockResolvedValue({
      status: 'completed', progress: 100, total: 2, completed: 2,
      details: { classified: 1, failed: [{ itemId: 'i2', title: 'Bad one', error: 'Ollama timeout' }] },
    })
    await startImport()
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 item could not be classified')
    expect(alert).toHaveTextContent('Bad one: Ollama timeout')
  })

  it('shows the job error when classification fails outright', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(fetchIngestJob).mockResolvedValue({
      status: 'failed', progress: 0, total: 1, completed: 1, error: 'Classification failed for every item — is Ollama running?',
    })
    await startImport()
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(await screen.findByRole('alert')).toHaveTextContent('is Ollama running?')
    expect(screen.getByText('Classification failed')).toBeInTheDocument()
  })

  it('handles an import where nothing was new (no job)', async () => {
    vi.mocked(startPasteImport).mockResolvedValue({ ...STARTED, saved: 0, jobId: null })
    await startImport()
    expect(screen.getByTestId('paste-result')).toHaveTextContent('Nothing new to save.')
    expect(fetchIngestJob).not.toHaveBeenCalled()
  })

  it('shows an error and stays on the compose view when starting fails (e.g. 409 already running)', async () => {
    vi.mocked(startPasteImport).mockRejectedValue(new Error('A paste import is already running. Wait for it to finish.'))
    render(<PasteImportPanel />)
    type('x')
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('paste-plan')
    fireEvent.click(screen.getByRole('button', { name: /import 1 item/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already running')
    expect(screen.queryByTestId('paste-result')).not.toBeInTheDocument()
  })

  it('"Import more" returns to an empty compose view', async () => {
    vi.mocked(fetchIngestJob).mockResolvedValue({ status: 'completed', progress: 100, total: 1, completed: 1 })
    await startImport()
    fireEvent.click(screen.getByRole('button', { name: /import more/i }))
    expect(box()).toHaveValue('')
    expect(screen.queryByTestId('paste-result')).not.toBeInTheDocument()
  })
})
