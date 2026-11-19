import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../cards/ItemCard', () => ({ default: ({ item }: any) => <div data-testid="preview-card">{item.title}</div> }))
vi.mock('./KeepImportPanel', () => ({ default: () => <div /> }))
vi.mock('./PasteImportPanel', () => ({ default: () => <div data-testid="paste-panel" /> }))
vi.mock('./FileIngestPanel', () => ({ default: () => <div /> }))
vi.mock('./VoiceIngestPanel', () => ({ default: () => <div /> }))
vi.mock('../Editor', () => ({
  default: ({ content, onChange }: any) => (
    <textarea data-testid="editor" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
}))

const mockCreateItem = vi.fn()
const mockIngestUrl = vi.fn()
vi.mock('../../lib/api', () => ({
  createItem: (...a: any[]) => mockCreateItem(...a),
  ingestUrl: (...a: any[]) => mockIngestUrl(...a),
  apiFetch: async (path: string, options: RequestInit) => {
    const response = await fetch(`/api${path}`, options)
    if (!response.ok) throw new Error('Request failed')
    return response.json()
  },
}))

import IngestPanel from './IngestPanel'

const SAVED = { id: 'new-1', title: 'saved' }

const textPreview = (over: Record<string, unknown> = {}) => ({
  title: 'Top AI repos',
  type: 'link',
  content: '',
  structured: { kind: 'repo', repoName: 'a/b', summary: 'Neat' },
  categories: ['Tech', 'AI', 'Repos'],
  tags: ['ai'],
  source: 'instagram',
  sourceUrl: 'https://www.instagram.com/p/Cabc123/',
  confidence: 83,
  intent: 'reference',
  reviewed: false,
  ...over,
})

function mockTextEndpoint(preview: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ preview, similarItems: [] }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateItem.mockResolvedValue(SAVED)
})

async function classifyManual(text: string) {
  fireEvent.click(screen.getByRole('tab', { name: /Manual Note/i }))
  fireEvent.change(screen.getByTestId('editor'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Classify & Add/i }))
  await screen.findByRole('button', { name: /Save to Memex/i })
}

describe('IngestPanel — manual tab', () => {
  it('saves the full payload: structured, intent, confidence, sourceUrl and reviewed=false', async () => {
    mockTextEndpoint(textPreview())
    const onSuccess = vi.fn()
    render(<IngestPanel onSuccess={onSuccess} />)

    await classifyManual('caption https://www.instagram.com/p/Cabc123/')
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledTimes(1))
    const req = mockCreateItem.mock.calls[0][0]
    expect(req).toMatchObject({
      title: 'Top AI repos',
      type: 'link',
      categories: ['Tech', 'AI', 'Repos'],
      structured: { kind: 'repo', repoName: 'a/b', summary: 'Neat' },
      intent: 'reference',
      confidence: 83,
      sourceUrl: 'https://www.instagram.com/p/Cabc123/',
      reviewed: false,
      priority: null,
    })
    expect(onSuccess).toHaveBeenCalledWith(SAVED)
  })

  it('keeps the server-detected source instead of forcing "manual"', async () => {
    mockTextEndpoint(textPreview({ source: 'instagram' }))
    render(<IngestPanel />)
    await classifyManual('caption')
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))
    await waitFor(() => expect(mockCreateItem).toHaveBeenCalled())
    expect(mockCreateItem.mock.calls[0][0].source).toBe('instagram')
  })

  it('saves the chosen priority', async () => {
    mockTextEndpoint(textPreview())
    render(<IngestPanel />)
    await classifyManual('caption')
    fireEvent.click(screen.getByRole('button', { name: 'Essential' }))
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))
    await waitFor(() => expect(mockCreateItem).toHaveBeenCalled())
    expect(mockCreateItem.mock.calls[0][0].priority).toBe('essential')
  })

  it('does not carry a priority over to the next capture', async () => {
    mockTextEndpoint(textPreview())
    render(<IngestPanel />)
    await classifyManual('first')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))
    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledTimes(1))

    await classifyManual('second')
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))
    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledTimes(2))
    expect(mockCreateItem.mock.calls[1][0].priority).toBeNull()
  })
})

describe('IngestPanel — URL tab', () => {
  it('saves a scraped GitHub repo with its structured data and source URL', async () => {
    mockIngestUrl.mockResolvedValue({
      preview: textPreview({ source: 'url', sourceUrl: 'https://github.com/a/b', title: 'a/b' }),
      similarItems: [],
    })
    render(<IngestPanel />)

    fireEvent.change(screen.getByPlaceholderText(/Paste URL/i), { target: { value: 'https://github.com/a/b' } })
    fireEvent.click(screen.getByRole('button', { name: /Analyze URL/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Save to Memex/i }))

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalled())
    expect(mockCreateItem.mock.calls[0][0]).toMatchObject({
      source: 'url',
      sourceUrl: 'https://github.com/a/b',
      structured: { kind: 'repo' },
      intent: 'reference',
      confidence: 83,
    })
  })
})

describe('IngestPanel — bulk paste tab', () => {
  it('offers a Bulk Paste tab that shows the paste import panel', () => {
    render(<IngestPanel />)
    expect(screen.queryByTestId('paste-panel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Bulk Paste/i }))
    expect(screen.getByTestId('paste-panel')).toBeInTheDocument()
  })
})
