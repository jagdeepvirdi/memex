import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

vi.mock('../../lib/api', async orig => ({
  ...(await orig<typeof import('../../lib/api')>()),
  fetchEmbeddingStatus: vi.fn(),
  fetchReembedEstimate: vi.fn(),
  setEmbeddingModel: vi.fn(),
  startReembed: vi.fn(),
}))

// The hook is tested on its own; here it is a stand-in whose state the tests control.
const hook = vi.hoisted(() => ({
  run: { running: false, percent: 0, label: '', cancelling: false },
  follow: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('./useReembedJob', () => ({ useReembedJob: () => hook }))

import { EmbeddingSettings } from './EmbeddingSettings'
import { fetchEmbeddingStatus, fetchReembedEstimate, setEmbeddingModel, startReembed } from '../../lib/api'
import type { EmbeddingStatus, ReembedEstimate } from '../../lib/api'

const STATUS: EmbeddingStatus = {
  provider: 'ollama', model: 'nomic-embed-text', id: 'ollama:nomic-embed-text', cloud: false, configured: true, usable: true,
  blockedReason: null, counts: { embedded: 725, needsReembed: 0, skippedPrivate: 0, pending: 0, total: 813 }, job: null,
}
const GEMINI_STATUS: EmbeddingStatus = {
  ...STATUS, provider: 'gemini', model: 'gemini-embedding-001', id: 'gemini:gemini-embedding-001', cloud: true,
}
const GEMINI_ESTIMATE: ReembedEstimate = {
  target: { provider: 'gemini', model: 'gemini-embedding-001', id: 'gemini:gemini-embedding-001' }, cloud: true,
  items: 657, characters: 139780, approxTokens: 34945, skippedPrivate: 156, alreadyDone: 0, entities: 0, blockedReason: null,
}
const LOCAL_ESTIMATE: ReembedEstimate = {
  target: { provider: 'ollama', model: 'nomic-embed-text', id: 'ollama:nomic-embed-text' }, cloud: false,
  items: 88, characters: 13660, approxTokens: 3415, skippedPrivate: 0, alreadyDone: 725, entities: 4, blockedReason: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  hook.run = { running: false, percent: 0, label: '', cancelling: false }
  vi.mocked(fetchEmbeddingStatus).mockResolvedValue(STATUS)
  vi.mocked(fetchReembedEstimate).mockResolvedValue(GEMINI_ESTIMATE)
  vi.mocked(setEmbeddingModel).mockResolvedValue(GEMINI_STATUS)
  vi.mocked(startReembed).mockResolvedValue({ jobId: 'job-9' })
})

const loaded = async () => { render(<EmbeddingSettings />); await screen.findByTestId('embedding-settings') }
const pickProvider = (value: string) => fireEvent.change(screen.getByLabelText('Embedding provider'), { target: { value } })
const review = async () => { fireEvent.click(screen.getByRole('button', { name: 'Review change' })); await screen.findByTestId('embedding-estimate') }

describe('EmbeddingSettings — status', () => {
  it('shows the active model and how much of the library is searchable', async () => {
    await loaded()
    expect(screen.getByText('ollama:nomic-embed-text')).toBeInTheDocument()
    expect(screen.getByText(/725 of 813 items searchable by meaning/)).toBeInTheDocument()
  })

  it('mentions items from another model, waiting items and private items only when there are some', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue({ ...STATUS, counts: { embedded: 10, needsReembed: 61, skippedPrivate: 3, pending: 88, total: 162 } })
    await loaded()
    expect(screen.getByText(/61 made by another model/)).toBeInTheDocument()
    expect(screen.getByText(/88 waiting/)).toBeInTheDocument()
    expect(screen.getByText(/3 private, kept on this machine/)).toBeInTheDocument()
  })

  it('shows nothing extra for a fully embedded library', async () => {
    await loaded()
    expect(screen.queryByText(/made by another model/)).not.toBeInTheDocument()
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Review re-embed/)).not.toBeInTheDocument()
  })

  it('explains why semantic search is paused', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue({ ...GEMINI_STATUS, usable: false, blockedReason: 'Strict Local Mode is on, so semantic search is paused and keyword search is used' })
    await loaded()
    expect(screen.getByRole('alert')).toHaveTextContent(/Semantic search is paused: Strict Local Mode is on/)
  })

  it('says so when the status cannot be read', async () => {
    vi.mocked(fetchEmbeddingStatus).mockRejectedValue(new Error('offline'))
    render(<EmbeddingSettings />)
    expect(await screen.findByText(/Could not read the embedding status/)).toBeInTheDocument()
  })

  it('shows the active cloud model in the pickers', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue(GEMINI_STATUS)
    await loaded()
    expect(screen.getByLabelText('Embedding provider')).toHaveValue('gemini')
    expect(screen.getByLabelText('Embedding model id')).toHaveValue('gemini-embedding-001')
  })
})

describe('EmbeddingSettings — reviewing a change sends nothing', () => {
  it('Review is off until something is changed', async () => {
    await loaded()
    expect(screen.getByRole('button', { name: 'Review change' })).toBeDisabled()
    pickProvider('gemini')
    expect(screen.getByRole('button', { name: 'Review change' })).toBeEnabled()
  })

  it('asks for an estimate of the chosen model, and does not switch or start anything', async () => {
    await loaded()
    pickProvider('gemini')
    await review()
    expect(fetchReembedEstimate).toHaveBeenCalledWith('gemini', '')
    expect(setEmbeddingModel).not.toHaveBeenCalled()
    expect(startReembed).not.toHaveBeenCalled()
  })

  it('for a cloud model, says exactly what will be sent and that private items stay home', async () => {
    await loaded()
    pickProvider('gemini')
    await review()
    const card = screen.getByTestId('embedding-estimate')
    expect(card).toHaveTextContent('Switch to Gemini (cloud)')
    // numbers are shown in the user's own locale (e.g. 1,39,780 in en-IN), so build the expectation the same way
    const fmt = (v: number) => v.toLocaleString()
    expect(card).toHaveTextContent(`The text of 657 items (about ${fmt(34945)} tokens, ${fmt(139780)} characters) will be sent to Gemini`)
    expect(card).toHaveTextContent(/156 private items.*are never sent/)
    expect(card).toHaveTextContent(/search falls back to keywords/)
  })

  it('for the local model, says it runs on this machine and that Ollama must be running', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue(GEMINI_STATUS)
    vi.mocked(fetchReembedEstimate).mockResolvedValue(LOCAL_ESTIMATE)
    await loaded()
    pickProvider('ollama')
    await review()
    const card = screen.getByTestId('embedding-estimate')
    expect(card).toHaveTextContent(/88 items and 4 names will be embedded on this machine with Ollama \(it must be running\)/)
    expect(card).not.toHaveTextContent(/will be sent/)
  })

  it('cannot be confirmed while the model is unusable, and says why', async () => {
    vi.mocked(fetchReembedEstimate).mockResolvedValue({ ...GEMINI_ESTIMATE, blockedReason: 'Cloud AI is not enabled in Settings' })
    await loaded()
    pickProvider('gemini')
    await review()
    expect(screen.getByRole('button', { name: 'Switch and re-embed' })).toBeDisabled()
    expect(within(screen.getByTestId('embedding-estimate')).getByRole('alert')).toHaveTextContent('Cloud AI is not enabled in Settings')
  })

  it('Cancel dismisses the review without doing anything', async () => {
    await loaded()
    pickProvider('gemini')
    await review()
    fireEvent.click(within(screen.getByTestId('embedding-estimate')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('embedding-estimate')).not.toBeInTheDocument()
    expect(setEmbeddingModel).not.toHaveBeenCalled()
  })

  it('changing the provider throws away a stale estimate', async () => {
    await loaded()
    pickProvider('gemini')
    await review()
    pickProvider('openai')
    expect(screen.queryByTestId('embedding-estimate')).not.toBeInTheDocument()
  })

  it('shows an error when the estimate cannot be made', async () => {
    vi.mocked(fetchReembedEstimate).mockRejectedValue(new Error('Invalid embedding provider or model'))
    await loaded()
    pickProvider('gemini')
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    expect(await screen.findByText('Invalid embedding provider or model')).toBeInTheDocument()
  })

  it('passes the model id the user typed', async () => {
    await loaded()
    pickProvider('gemini')
    fireEvent.change(screen.getByLabelText('Embedding model id'), { target: { value: 'gemini-embedding-2' } })
    await review()
    expect(fetchReembedEstimate).toHaveBeenCalledWith('gemini', 'gemini-embedding-2')
  })
})

describe('EmbeddingSettings — confirming', () => {
  it('switches first, then starts the job for the model it switched to, then follows it', async () => {
    await loaded()
    pickProvider('gemini')
    await review()
    fireEvent.click(screen.getByRole('button', { name: 'Switch and re-embed' }))
    await waitFor(() => expect(hook.follow).toHaveBeenCalledWith('job-9'))
    expect(setEmbeddingModel).toHaveBeenCalledWith('gemini', '')
    expect(startReembed).toHaveBeenCalledWith('gemini:gemini-embedding-001')
    expect(vi.mocked(setEmbeddingModel).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(startReembed).mock.invocationCallOrder[0])
    expect(screen.queryByTestId('embedding-estimate')).not.toBeInTheDocument()
  })

  it('only switches when nothing needs embedding', async () => {
    vi.mocked(fetchReembedEstimate).mockResolvedValue({ ...GEMINI_ESTIMATE, items: 0, entities: 0, skippedPrivate: 0, alreadyDone: 700 })
    await loaded()
    pickProvider('gemini')
    await review()
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(setEmbeddingModel).toHaveBeenCalled()
    expect(startReembed).not.toHaveBeenCalled()
    expect(hook.follow).not.toHaveBeenCalled()
  })

  it('shows the server message and starts no job when the switch is refused', async () => {
    vi.mocked(setEmbeddingModel).mockRejectedValue(new Error('No API key is configured for gemini'))
    await loaded()
    pickProvider('gemini')
    await review()
    fireEvent.click(screen.getByRole('button', { name: 'Switch and re-embed' }))
    expect(await screen.findByText('No API key is configured for gemini')).toBeInTheDocument()
    expect(startReembed).not.toHaveBeenCalled()
    expect(hook.follow).not.toHaveBeenCalled()
    expect(fetchEmbeddingStatus).toHaveBeenCalledTimes(2) // reloaded, so the page shows what is really active
  })

  it('shows the server message when the job cannot start', async () => {
    vi.mocked(startReembed).mockRejectedValue(new Error('A re-embed is already running.'))
    await loaded()
    pickProvider('gemini')
    await review()
    fireEvent.click(screen.getByRole('button', { name: 'Switch and re-embed' }))
    expect(await screen.findByText('A re-embed is already running.')).toBeInTheDocument()
    expect(hook.follow).not.toHaveBeenCalled()
  })
})

describe('EmbeddingSettings — re-embedding with the active model', () => {
  const needing: EmbeddingStatus = { ...STATUS, counts: { embedded: 10, needsReembed: 61, skippedPrivate: 0, pending: 0, total: 71 } }

  it('offers it when items were made by another model, and explains why search ignores them', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue(needing)
    await loaded()
    expect(screen.getByText(/61 items were embedded by a different model, so search ignores them/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review re-embed' })).toBeInTheDocument()
  })

  it('does not offer it while the model is unusable', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue({ ...needing, usable: false, blockedReason: 'Cloud AI is not enabled in Settings' })
    await loaded()
    expect(screen.queryByRole('button', { name: 'Review re-embed' })).not.toBeInTheDocument()
  })

  it('re-embeds without switching: the model is already active', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue(needing)
    vi.mocked(fetchReembedEstimate).mockResolvedValue(LOCAL_ESTIMATE)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Review re-embed' }))
    await screen.findByTestId('embedding-estimate')
    expect(fetchReembedEstimate).toHaveBeenCalledWith() // no provider: the active model
    expect(screen.getByTestId('embedding-estimate')).toHaveTextContent('Re-embed with')
    fireEvent.click(screen.getByRole('button', { name: 'Re-embed now' }))
    await waitFor(() => expect(hook.follow).toHaveBeenCalledWith('job-9'))
    expect(setEmbeddingModel).not.toHaveBeenCalled()
    expect(startReembed).toHaveBeenCalledWith('ollama:nomic-embed-text')
  })

  it('has nothing to confirm when the active model needs no embedding', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue(needing)
    vi.mocked(fetchReembedEstimate).mockResolvedValue({ ...LOCAL_ESTIMATE, items: 0, entities: 0 })
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Review re-embed' }))
    await screen.findByTestId('embedding-estimate')
    expect(screen.getByRole('button', { name: 'Nothing to do' })).toBeDisabled()
    expect(screen.getByTestId('embedding-estimate')).toHaveTextContent('Nothing needs embedding')
  })
})

describe('EmbeddingSettings — a running job', () => {
  it('picks up a job that was already running when the page loaded', async () => {
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue({ ...STATUS, job: { id: 'job-3', progress: 40, completed: 40, total: 100 } })
    await loaded()
    expect(hook.follow).toHaveBeenCalledWith('job-3')
  })

  it('shows progress with a Cancel button, and locks the controls', async () => {
    hook.run = { running: true, percent: 40, label: 'Embedding items: 40 of 100', cancelling: false }
    await loaded()
    expect(screen.getByRole('status')).toHaveTextContent('Embedding items: 40 of 100')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByLabelText('Embedding provider')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(hook.cancel).toHaveBeenCalledTimes(1)
  })

  it('shows Cancelling… and cannot be cancelled twice', async () => {
    hook.run = { running: true, percent: 40, label: 'Cancelling…', cancelling: true }
    await loaded()
    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled()
  })

  it('does not offer a second re-embed while one runs', async () => {
    hook.run = { running: true, percent: 10, label: 'Embedding items: 10 of 100', cancelling: false }
    vi.mocked(fetchEmbeddingStatus).mockResolvedValue({ ...STATUS, counts: { embedded: 1, needsReembed: 50, skippedPrivate: 0, pending: 0, total: 51 } })
    await loaded()
    expect(screen.queryByRole('button', { name: 'Review re-embed' })).not.toBeInTheDocument()
  })
})
