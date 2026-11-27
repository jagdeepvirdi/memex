import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))
vi.mock('../../lib/api', () => ({
  previewBookmarkImport: vi.fn(),
  startBookmarkImport: vi.fn(),
  fetchIngestJob: vi.fn(),
}))

import BookmarkImportPanel from './BookmarkImportPanel'
import { previewBookmarkImport, startBookmarkImport, fetchIngestJob } from '../../lib/api'
import type { BookmarkImportResponse } from '../../lib/api'

const ENTRIES: BookmarkImportResponse['entries'] = [
  { index: 0, url: 'https://example.com/soup', title: 'Soup', tags: ['dinner', 'recipes'], folder: 'Recipes', status: 'saved' },
  { index: 1, url: 'https://example.com/old', title: 'Old link', tags: [], status: 'skipped', reason: 'already-saved', existingId: 'old-1' },
  { index: 2, url: 'https://example.com/soup/', title: 'Soup again', tags: [], status: 'skipped', reason: 'duplicate-in-file' },
  { index: 3, url: 'javascript:void(0)', title: 'Not a page', tags: [], status: 'skipped', reason: 'not-a-link' },
]
const PLAN: BookmarkImportResponse = { dryRun: true, total: 4, new: 1, skipped: 3, max: 1000, entries: ENTRIES }
const STARTED: BookmarkImportResponse = { ...PLAN, dryRun: false, saved: 1, jobId: 'job-1' }
const FILE = new File(['<DL></DL>'], 'bookmarks.html', { type: 'text/html' })

const pick = (f: File | null = FILE) =>
  fireEvent.change(screen.getByLabelText(/bookmarks export file/i), { target: { files: f ? [f] : [] } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(previewBookmarkImport).mockResolvedValue(PLAN)
  vi.mocked(startBookmarkImport).mockResolvedValue(STARTED)
})
afterEach(() => vi.useRealTimers())

describe('BookmarkImportPanel — choose and preview', () => {
  it('disables Preview and Import until a file is chosen and previewed', () => {
    render(<BookmarkImportPanel />)
    expect(screen.getByRole('button', { name: /preview/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
    pick()
    expect(screen.getByRole('button', { name: /preview/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })

  it('says plainly that no page is opened', () => {
    render(<BookmarkImportPanel />)
    expect(screen.getByText(/No page is opened/i)).toBeInTheDocument()
  })

  it('previews without importing, with counts, tags, skip reasons and a link to the existing item', async () => {
    render(<BookmarkImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    const plan = await screen.findByTestId('bookmark-plan')
    expect(previewBookmarkImport).toHaveBeenCalledWith(FILE)
    expect(startBookmarkImport).not.toHaveBeenCalled()
    expect(plan).toHaveTextContent('1 to import')
    expect(plan).toHaveTextContent('3 skipped')
    expect(plan).toHaveTextContent('dinner, recipes')
    expect(plan).toHaveTextContent('Already in Memex')
    expect(plan).toHaveTextContent('Repeated in this file')
    expect(plan).toHaveTextContent('Not a web address')
    expect(screen.getByRole('link', { name: 'view' })).toHaveAttribute('href', '/item/old-1')
    expect(screen.getByRole('button', { name: 'Import 1 link' })).toBeEnabled()
  })

  it('shows the server message when the file cannot be read', async () => {
    vi.mocked(previewBookmarkImport).mockRejectedValue(new Error('Upload a bookmarks export.'))
    render(<BookmarkImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload a bookmarks export')
  })

  it('drops an old preview when another file is chosen', async () => {
    render(<BookmarkImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('bookmark-plan')
    pick(new File(['x'], 'other.html'))
    expect(screen.queryByTestId('bookmark-plan')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })
})

describe('BookmarkImportPanel — import and background classification', () => {
  it('imports, announces new items, and follows the classification job to the end', async () => {
    const captured = vi.fn()
    window.addEventListener('memex:item-captured', captured)
    render(<BookmarkImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('bookmark-plan')

    vi.useFakeTimers()
    vi.mocked(fetchIngestJob)
      .mockResolvedValueOnce({ status: 'processing', progress: 50, total: 1, completed: 0 })
      .mockResolvedValue({ status: 'completed', progress: 100, total: 1, completed: 1, details: { classified: 1, failed: [] } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import 1 link' })) })

    expect(startBookmarkImport).toHaveBeenCalledWith(FILE)
    expect(captured).toHaveBeenCalled()
    expect(screen.getByTestId('bookmark-result')).toHaveTextContent('1 saved, 3 skipped')

    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(screen.getByText('Classification finished')).toBeInTheDocument()
    window.removeEventListener('memex:item-captured', captured)
  })

  it('offers Import more after a result', async () => {
    render(<BookmarkImportPanel />)
    pick()
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await screen.findByTestId('bookmark-plan')
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 link' }))
    await screen.findByTestId('bookmark-result')
    fireEvent.click(screen.getByRole('button', { name: 'Import more' }))
    expect(screen.getByLabelText(/bookmarks export file/i)).toBeInTheDocument()
  })
})
