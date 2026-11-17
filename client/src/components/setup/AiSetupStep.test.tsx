import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  saveApiKey: vi.fn(),
  testAiProvider: vi.fn(),
  setEmbeddingModel: vi.fn(),
}))

import { AiSetupStep, readableProviderError } from './AiSetupStep'
import { apiFetch, saveApiKey, testAiProvider, setEmbeddingModel } from '../../lib/api'

const onDone = vi.fn()
const call = (n: number) => vi.mocked(apiFetch).mock.calls[n]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockResolvedValue({ status: 'ok' })
  vi.mocked(saveApiKey).mockResolvedValue({} as never)
  vi.mocked(testAiProvider).mockResolvedValue({ ok: true, provider: 'gemini', model: 'gemini-3.8-flash', latencyMs: 400 })
  vi.mocked(setEmbeddingModel).mockResolvedValue({} as never)
})

const open = (which: 'cloud' | 'local') => {
  render(<AiSetupStep onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: new RegExp(which === 'cloud' ? 'In the cloud' : 'On my computer') }))
}
const providerButton = (name: string) => screen.getByRole('button', { name })
const typeKey = (v: string) => fireEvent.change(screen.getByLabelText(/API key$/i, { selector: '#ai-setup-key' }), { target: { value: v } })
const consent = () => fireEvent.click(screen.getByLabelText(/I agree to send my notes/i))
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Set up cloud AI|Try again/ }))
const setup = () => screen.getByRole('button', { name: /Set up cloud AI|Try again/ })

describe('AiSetupStep — the choice', () => {
  it('asks where the AI should run and shows nothing else until a choice is made', () => {
    render(<AiSetupStep onDone={onDone} />)
    expect(screen.getByText('How should Memex think?')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-setup-local')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-setup-cloud')).not.toBeInTheDocument()
  })

  it('can be skipped, leaving local AI as the default', () => {
    render(<AiSetupStep onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/ }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(saveApiKey).not.toHaveBeenCalled()
  })
})

describe('AiSetupStep — local', () => {
  it('shows Ollama as running and lets you continue', async () => {
    open('local')
    expect(await screen.findByText('Ollama is running.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with local AI' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('explains how to get Ollama when it is not running, and still lets you continue', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'))
    open('local')
    expect(await screen.findByText('Ollama is not running yet.')).toBeInTheDocument()
    expect(screen.getByText(/ollama pull llama3.2/)).toBeInTheDocument()
    expect(screen.getByText(/ollama pull nomic-embed-text/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with local AI' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('changes nothing on the server', async () => {
    open('local')
    await screen.findByText('Ollama is running.')
    fireEvent.click(screen.getByRole('button', { name: 'Continue with local AI' }))
    expect(saveApiKey).not.toHaveBeenCalled()
    expect(setEmbeddingModel).not.toHaveBeenCalled()
    expect(vi.mocked(apiFetch).mock.calls.every(c => c[0] === '/health/ollama')).toBe(true)
  })
})

describe('AiSetupStep — cloud: what you must do before you can continue', () => {
  it('offers all four providers and says which cannot do search', () => {
    open('cloud')
    for (const n of ['Gemini', 'OpenAI', 'Claude', 'Groq']) expect(providerButton(n)).toBeInTheDocument()
    fireEvent.click(providerButton('Claude'))
    expect(screen.getByText(/Answers only/)).toBeInTheDocument()
  })

  it('stays disabled until there is a key AND consent', () => {
    open('cloud')
    expect(setup()).toBeDisabled()
    typeKey('AIzaFakeKeyForTests')
    expect(setup()).toBeDisabled()
    consent()
    expect(setup()).toBeEnabled()
  })

  it('consent alone is not enough, and a blank key does not count', () => {
    open('cloud')
    consent()
    expect(setup()).toBeDisabled()
    typeKey('   ')
    expect(setup()).toBeDisabled()
  })

  it('spells out what is sent and what never is', () => {
    open('cloud')
    expect(screen.getByText(/Items in the Passwords or Personal categories/)).toBeInTheDocument()
    expect(screen.getByText(/never sent/)).toBeInTheDocument()
    expect(screen.getByText(/Strict Local Mode/)).toBeInTheDocument()
  })

  it('treats the key like a password field and tells you where to get one', () => {
    open('cloud')
    expect((document.getElementById('ai-setup-key') as HTMLInputElement).type).toBe('password')
    expect(screen.getByText('aistudio.google.com')).toBeInTheDocument()
  })
})

describe('AiSetupStep — cloud: Gemini, all in the cloud (the verified order)', () => {
  it('saves the key, turns on cloud AI, tests it, THEN switches search, then finishes', async () => {
    open('cloud')
    typeKey('  AIzaFakeKeyForTests  ')
    consent()
    submit()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))

    expect(saveApiKey).toHaveBeenCalledTimes(1)
    expect(saveApiKey).toHaveBeenCalledWith('gemini', 'AIzaFakeKeyForTests') // trimmed
    expect(call(0)[0]).toBe('/settings')
    expect(JSON.parse((call(0)[1] as RequestInit).body as string)).toEqual({ ai_provider: 'gemini', allow_cloud: true })
    expect(testAiProvider).toHaveBeenCalledWith('gemini')
    expect(setEmbeddingModel).toHaveBeenCalledWith('gemini')

    const order = [
      vi.mocked(saveApiKey).mock.invocationCallOrder[0],
      vi.mocked(apiFetch).mock.invocationCallOrder[0],
      vi.mocked(testAiProvider).mock.invocationCallOrder[0],
      vi.mocked(setEmbeddingModel).mock.invocationCallOrder[0],
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('shows each stage as it completes', async () => {
    open('cloud')
    typeKey('k'); consent(); submit()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const items = within(screen.getByRole('list', { name: 'Setup progress' })).getAllByRole('listitem')
    expect(items.map(li => li.textContent)).toEqual([
      'Saving your Gemini key', 'Turning on cloud AI (your consent)', 'Testing the connection to Gemini', 'Switching search to Gemini',
    ])
    expect(items.every(li => li.getAttribute('data-state') === 'done')).toBe(true)
  })

  it('does not switch search to the cloud if the user keeps it local', async () => {
    open('cloud')
    typeKey('k')
    fireEvent.click(screen.getByLabelText(/Keep search on my computer/))
    consent(); submit()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(setEmbeddingModel).not.toHaveBeenCalled()
    expect(saveApiKey).toHaveBeenCalledTimes(1)
  })

  it('OpenAI works the same way and switches search to OpenAI', async () => {
    vi.mocked(testAiProvider).mockResolvedValue({ ok: true, provider: 'openai' })
    open('cloud')
    fireEvent.click(providerButton('OpenAI'))
    typeKey('sk-fake'); consent(); submit()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(saveApiKey).toHaveBeenCalledWith('openai', 'sk-fake')
    expect(setEmbeddingModel).toHaveBeenCalledWith('openai')
  })
})

describe('AiSetupStep — cloud: a provider that cannot embed (Claude, Groq)', () => {
  it('asks where search should run, and needs a second key for a cloud choice', async () => {
    open('cloud')
    fireEvent.click(providerButton('Claude'))
    typeKey('sk-ant-fake'); consent()
    // Gemini is preselected for search, so a Gemini key is required too
    expect(screen.getByLabelText(/Gemini API key \(for search\)/)).toBeInTheDocument()
    expect(setup()).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Gemini API key \(for search\)/), { target: { value: 'AIzaSearchKey' } })
    expect(setup()).toBeEnabled()
    vi.mocked(testAiProvider).mockResolvedValue({ ok: true, provider: 'claude' })
    submit()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(saveApiKey).toHaveBeenCalledWith('claude', 'sk-ant-fake')
    expect(saveApiKey).toHaveBeenCalledWith('gemini', 'AIzaSearchKey')
    expect(testAiProvider).toHaveBeenCalledWith('claude')
    expect(setEmbeddingModel).toHaveBeenCalledWith('gemini')
    expect(JSON.parse((call(0)[1] as RequestInit).body as string).ai_provider).toBe('claude')
  })

  it('needs no second key when search stays on Ollama', async () => {
    vi.mocked(testAiProvider).mockResolvedValue({ ok: true, provider: 'groq' })
    open('cloud')
    fireEvent.click(providerButton('Groq'))
    typeKey('gsk_fake'); consent()
    fireEvent.click(screen.getByLabelText(/On my computer/))
    expect(screen.queryByLabelText(/API key \(for search\)/)).not.toBeInTheDocument()
    expect(setup()).toBeEnabled()
    submit()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(saveApiKey).toHaveBeenCalledTimes(1)
    expect(setEmbeddingModel).not.toHaveBeenCalled()
  })

  it('does not offer to switch search to a provider that was chosen only for answers', async () => {
    open('cloud')
    fireEvent.click(providerButton('Groq'))
    typeKey('gsk'); fireEvent.change(screen.getByLabelText(/Gemini API key \(for search\)/), { target: { value: 'g' } }); consent(); submit()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(setEmbeddingModel).not.toHaveBeenCalledWith('groq')
  })
})

describe('readableProviderError', () => {
  it('shows the sentence from a provider JSON error, not the document', () => {
    const raw = 'Gemini did not answer: {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}'
    expect(readableProviderError(raw)).toBe('API key not valid. Please pass a valid API key.')
    expect(readableProviderError('{"error":"quota exceeded"}')).toBe('quota exceeded')
    expect(readableProviderError('{"message":"top level"}')).toBe('top level')
  })
  it('keeps plain text as it is, shortens a very long one, and copes with nothing or broken JSON', () => {
    expect(readableProviderError('connect ECONNREFUSED')).toBe('connect ECONNREFUSED')
    expect(readableProviderError('x'.repeat(500))).toHaveLength(203)
    expect(readableProviderError(undefined)).toBe('unknown error')
    expect(readableProviderError('oops {not json')).toBe('oops {not json')
  })
})

describe('AiSetupStep — cloud: when something goes wrong', () => {
  it('a rejected key says so in plain words, stops before touching search, and does not finish', async () => {
    vi.mocked(testAiProvider).mockResolvedValue({ ok: false, provider: 'gemini', kind: 'auth', error: 'API key not valid' })
    open('cloud')
    typeKey('wrong'); consent(); submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini rejected the key. Check that you copied all of it, then try again.')
    expect(setEmbeddingModel).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    const items = within(screen.getByRole('list', { name: 'Setup progress' })).getAllByRole('listitem')
    expect(items.map(li => li.getAttribute('data-state'))).toEqual(['done', 'done', 'failed', 'pending'])
  })

  it('any other provider failure shows the provider\'s own message', async () => {
    vi.mocked(testAiProvider).mockResolvedValue({ ok: false, provider: 'gemini', kind: 'rate_limit', error: 'quota exceeded' })
    open('cloud')
    typeKey('k'); consent(); submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini did not answer: quota exceeded')
  })

  it('shows a provider\'s JSON error as one readable sentence', async () => {
    vi.mocked(testAiProvider).mockResolvedValue({ ok: false, provider: 'gemini', kind: 'unavailable', error: '{"error":{"code":503,"message":"The model is overloaded."}}' })
    open('cloud')
    typeKey('k'); consent(); submit()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Gemini did not answer: The model is overloaded.')
    expect(alert.textContent).not.toContain('{')
  })

  it('a key that cannot be saved (for example migration 026 not applied) shows the server message and goes no further', async () => {
    vi.mocked(saveApiKey).mockRejectedValue(new Error('The database needs its latest migration — run "npm run migrate" in server/ and try again.'))
    open('cloud')
    typeKey('k'); consent(); submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/npm run migrate/)
    expect(apiFetch).not.toHaveBeenCalled() // consent was never switched on
    expect(testAiProvider).not.toHaveBeenCalled()
  })

  it('a failed switch of search says what failed and does not finish', async () => {
    vi.mocked(setEmbeddingModel).mockRejectedValue(new Error('Cloud AI is not enabled in Settings'))
    open('cloud')
    typeKey('k'); consent(); submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Cloud AI is not enabled in Settings')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('offers "Try again" after a failure and can then succeed', async () => {
    vi.mocked(testAiProvider).mockResolvedValueOnce({ ok: false, provider: 'gemini', kind: 'auth', error: 'bad' })
    open('cloud')
    typeKey('wrong'); consent(); submit()
    await screen.findByRole('alert')
    typeKey('right')
    expect(setup()).toHaveTextContent('Try again')
    submit()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(saveApiKey).toHaveBeenLastCalledWith('gemini', 'right')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('locks the form while it is working, so a double click cannot run it twice', async () => {
    let release: (v: unknown) => void = () => {}
    vi.mocked(testAiProvider).mockReturnValue(new Promise((r) => { release = r }) as never)
    open('cloud')
    typeKey('k'); consent(); submit()
    await waitFor(() => expect(testAiProvider).toHaveBeenCalled())
    expect(setup()).toBeDisabled()
    expect(document.getElementById('ai-setup-key')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Skip for now/ })).toBeDisabled()
    release({ ok: true, provider: 'gemini' })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(saveApiKey).toHaveBeenCalledTimes(1)
  })

  it('never writes the key anywhere visible', async () => {
    open('cloud')
    typeKey('SUPER-SECRET-KEY-VALUE'); consent(); submit()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(document.body.textContent).not.toContain('SUPER-SECRET-KEY-VALUE')
  })
})
