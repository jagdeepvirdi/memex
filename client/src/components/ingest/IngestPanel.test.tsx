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

describe('IngestPanel — places found in a note', () => {
  const places = [
    { name: 'Old Mill Cafe', type: 'cafe', confidence: 90 },
    { name: 'Lakeview Hotel', type: 'hotel', city: 'Pine Valley', confidence: 88 },
    { name: 'Maple Diner', type: 'restaurant', confidence: 90 },
  ]
  const tripPreview = () => textPreview({ type: 'place', title: 'Pine Valley', source: 'manual', sourceUrl: undefined, places, placesModel: 'gemini:gemini-x' })

  it('lists the places, all ticked, and saves them with the note', async () => {
    mockTextEndpoint(tripPreview())
    render(<IngestPanel />)
    await classifyManual('Pine Valley trip')

    expect(screen.getByText(/3 of 3 will be saved as their own entries/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))
    await waitFor(() => expect(mockCreateItem).toHaveBeenCalled())

    const req = mockCreateItem.mock.calls[0][0]
    expect(req.places.map((p: { name: string }) => p.name)).toEqual(['Old Mill Cafe', 'Lakeview Hotel', 'Maple Diner'])
    expect(req.placesModel).toBe('gemini:gemini-x')
  })

  it('leaves out a place the user unticks', async () => {
    mockTextEndpoint(tripPreview())
    render(<IngestPanel />)
    await classifyManual('Pine Valley trip')

    fireEvent.click(screen.getByRole('checkbox', { name: /Lakeview Hotel/i }))
    expect(screen.getByText(/2 of 3 will be saved/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))
    await waitFor(() => expect(mockCreateItem).toHaveBeenCalled())

    expect(mockCreateItem.mock.calls[0][0].places.map((p: { name: string }) => p.name)).toEqual(['Old Mill Cafe', 'Maple Diner'])
  })

  it('sends no places when every one is unticked', async () => {
    mockTextEndpoint(tripPreview())
    render(<IngestPanel />)
    await classifyManual('Pine Valley trip')
    for (const name of [/Old Mill Cafe/i, /Lakeview Hotel/i, /Maple Diner/i]) fireEvent.click(screen.getByRole('checkbox', { name }))
    fireEvent.click(screen.getByRole('button', { name: /Save to Memex/i }))
    await waitFor(() => expect(mockCreateItem).toHaveBeenCalled())
    expect(mockCreateItem.mock.calls[0][0]).not.toHaveProperty('places')
  })

  it('shows no place list for a note without places', async () => {
    mockTextEndpoint(textPreview())
    render(<IngestPanel />)
    await classifyManual('caption')
    expect(screen.queryByText(/Places in this note/i)).not.toBeInTheDocument()
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
