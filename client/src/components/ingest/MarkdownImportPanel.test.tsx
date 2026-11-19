import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))
vi.mock('../../lib/api', () => ({
  previewMarkdownImport: vi.fn(),
  startMarkdownImport: vi.fn(),
  fetchIngestJob: vi.fn(),
}))

import MarkdownImportPanel from './MarkdownImportPanel'
import { previewMarkdownImport, startMarkdownImport, fetchIngestJob } from '../../lib/api'
import type { MarkdownImportResponse } from '../../lib/api'

const ENTRIES: MarkdownImportResponse['entries'] = [
  { index: 0, path: 'v/Trip.md', title: 'Trip plan', tags: ['travel', 'food'], status: 'saved' },
  { index: 1, path: 'v/Old.md', title: 'Old note', tags: [], status: 'skipped', reason: 'already-saved', existingId: 'old-1' },
  { index: 2, path: 'v/Copy.md', title: 'Trip plan', tags: [], status: 'skipped', reason: 'duplicate-in-zip' },
]
const PLAN: MarkdownImportResponse = { dryRun: true, total: 3, new: 1, skipped: 2, otherFilesIgnored: 4, max: 500, entries: ENTRIES }
const STARTED: MarkdownImportResponse = { ...PLAN, dryRun: false, saved: 1, jobId: 'job-1' }
const FILE = new File(['zip'], 'vault.zip', { type: 'application/zip' })

const pick = (f: File | null = FILE) =>
  fireEvent.change(screen.getByLabelText(/zipped folder of notes/i), { target: { files: f ? [f] : [] } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(previewMarkdownImport).mockResolvedValue(PLAN)
  vi.mocked(startMarkdownImport).mockResolvedValue(STARTED)
})
afterEach(() => vi.useRealTimers())

describe('MarkdownImportPanel — choose and preview', () => {
  it('disables Preview and Import until a file is chosen and previewed', () => {
    render(<MarkdownImportPanel />)
    expect(screen.getByRole('button', { name: /preview/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
    pick()
    expect(screen.getByRole('button', { name: /preview/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })

  it('previews without importing, with counts, tags, skip reasons and a link to the existing note', async () => {
    render(<MarkdownImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    const plan = await screen.findByTestId('markdown-plan')
    expect(previewMarkdownImport).toHaveBeenCalledWith(FILE)
    expect(startMarkdownImport).not.toHaveBeenCalled()
    expect(plan).toHaveTextContent('1 to import')
    expect(plan).toHaveTextContent('2 skipped')
    expect(plan).toHaveTextContent('4 other files ignored')
    expect(plan).toHaveTextContent('travel, food')
    expect(plan).toHaveTextContent('Already in Memex')
    expect(plan).toHaveTextContent('Repeated in this folder')
    expect(screen.getByRole('link', { name: 'view' })).toHaveAttribute('href', '/item/old-1')
    expect(screen.getByRole('button', { name: 'Import 1 note' })).toBeEnabled()
  })

  it('shows the server message when the file cannot be read', async () => {
    vi.mocked(previewMarkdownImport).mockRejectedValue(new Error('That does not look like a ZIP file.'))
    render(<MarkdownImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like a ZIP')
  })

  it('drops an old preview when another file is chosen', async () => {
    render(<MarkdownImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('markdown-plan')
    pick(new File(['x'], 'other.zip'))
    expect(screen.queryByTestId('markdown-plan')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })
})

describe('MarkdownImportPanel — import and progress', () => {
  it('imports, announces the capture and shows classification progress until it finishes', async () => {
    const captured = vi.fn()
    window.addEventListener('memex:item-captured', captured)
    render(<MarkdownImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('markdown-plan')

    vi.useFakeTimers()
    vi.mocked(fetchIngestJob)
      .mockResolvedValueOnce({ status: 'processing', progress: 50, total: 1, completed: 0 })
      .mockResolvedValue({ status: 'completed', progress: 100, total: 1, completed: 1, details: { classified: 1, failed: [] } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import 1 note' })) })

    expect(startMarkdownImport).toHaveBeenCalledWith(FILE)
    expect(captured).toHaveBeenCalled()
    expect(screen.getByTestId('markdown-result')).toHaveTextContent('1 saved, 2 skipped')

    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(screen.getByText('Classification finished')).toBeInTheDocument()
    window.removeEventListener('memex:item-captured', captured)
  })

  it('says so when nothing new was saved, and offers to import more', async () => {
    vi.mocked(startMarkdownImport).mockResolvedValue({ ...STARTED, saved: 0, jobId: null })
    render(<MarkdownImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('markdown-plan')
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 note' }))
    await waitFor(() => expect(screen.getByTestId('markdown-result')).toHaveTextContent('Nothing new to save'))
    fireEvent.click(screen.getByRole('button', { name: /import more/i }))
    expect(screen.getByLabelText(/zipped folder of notes/i)).toBeInTheDocument()
  })
})
