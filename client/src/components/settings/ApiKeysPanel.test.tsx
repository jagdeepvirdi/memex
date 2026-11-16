import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const mockFetch = vi.fn()
const mockSave = vi.fn()
const mockRemove = vi.fn()
const mockTest = vi.fn()
vi.mock('../../lib/api', () => ({
  fetchApiKeys: () => mockFetch(),
  saveApiKey: (p: string, k: string) => mockSave(p, k),
  removeApiKey: (p: string) => mockRemove(p),
  testYoutubeKey: () => mockTest(),
}))

import { ApiKeysPanel } from './ApiKeysPanel'
import type { ApiKeyStatus } from '../../lib/api'

const status = (provider: ApiKeyStatus['provider'], over: Partial<ApiKeyStatus> = {}): ApiKeyStatus => ({
  provider,
  label: { claude: 'Anthropic (Claude)', gemini: 'Google Gemini', openai: 'OpenAI (ChatGPT)', youtube: 'YouTube Data API' }[provider],
  configured: false, source: null, hasStored: false, undecryptable: false, ...over,
})
const NONE = [status('claude'), status('gemini'), status('openai'), status('youtube')]
const SECRET = 'sk-ant-api03-TOPSECRETVALUE-1234'

const setup = async (statuses: ApiKeyStatus[] = NONE, onChanged = vi.fn()) => {
  mockFetch.mockResolvedValue(statuses)
  const utils = render(<ApiKeysPanel onChanged={onChanged} />)
  await waitFor(() => expect(screen.getByTestId('api-key-status-claude')).toBeInTheDocument())
  return { ...utils, onChanged }
}
const row = (p: string) => screen.getByTestId(`api-key-${p}`)
const type = (p: string, v: string) => fireEvent.change(within(row(p)).getByLabelText(/./, { selector: 'input' }), { target: { value: v } })

beforeEach(() => vi.clearAllMocks())

describe('ApiKeysPanel — OpenAI', () => {
  it('saves an OpenAI key under the openai provider and clears the field', async () => {
    mockSave.mockResolvedValue(status('openai', { configured: true, source: 'stored', last4: '7788', hasStored: true }))
    const { onChanged } = await setup()
    type('openai', 'sk-proj-OpenAiSecretValueABCD7788')
    fireEvent.click(within(row('openai')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('openai', 'sk-proj-OpenAiSecretValueABCD7788'))
    await waitFor(() => expect(screen.getByTestId('api-key-status-openai')).toHaveTextContent('Saved · ends in 7788'))
    expect((within(row('openai')).getByLabelText(/./, { selector: 'input' }) as HTMLInputElement).value).toBe('')
    expect(onChanged).toHaveBeenCalled()
  })

  it('explains that the API is separate from a ChatGPT subscription', async () => {
    await setup()
    expect(row('openai')).toHaveTextContent(/separate from a ChatGPT subscription/i)
    expect(row('openai')).toHaveTextContent('platform.openai.com')
  })
})

describe('ApiKeysPanel — display', () => {
  it('shows each provider as not set by default', async () => {
    await setup()
    for (const p of ['claude', 'gemini', 'openai', 'youtube']) expect(screen.getByTestId(`api-key-status-${p}`)).toHaveTextContent('Not set')
    expect(screen.getByLabelText('Anthropic (Claude)')).toBeInTheDocument()
    expect(screen.getByLabelText('OpenAI (ChatGPT)')).toBeInTheDocument()
    expect(screen.getByLabelText('YouTube Data API')).toBeInTheDocument()
  })

  it('shows a saved key as saved with its last four characters only', async () => {
    await setup([status('claude', { configured: true, source: 'stored', last4: '1234', hasStored: true }), status('gemini'), status('youtube')])
    expect(screen.getByTestId('api-key-status-claude')).toHaveTextContent('Saved · ends in 1234')
  })

  it('says an environment key takes priority', async () => {
    await setup([status('claude'), status('gemini', { configured: true, source: 'env', last4: '9876' }), status('youtube')])
    expect(screen.getByTestId('api-key-status-gemini')).toHaveTextContent(/server environment · ends in 9876/)
    expect(screen.getByTestId('api-key-status-gemini')).toHaveTextContent(/takes priority/)
  })

  it('warns when a saved key can no longer be decrypted', async () => {
    await setup([status('claude', { hasStored: true, undecryptable: true }), status('gemini'), status('youtube')])
    expect(within(row('claude')).getByRole('alert')).toHaveTextContent(/can’t be read/)
  })

  it('inputs are password fields that are never pre-filled', async () => {
    const { container } = await setup([status('claude', { configured: true, source: 'stored', last4: '1234', hasStored: true }), status('gemini'), status('openai'), status('youtube')])
    const inputs = container.querySelectorAll('input')
    expect(inputs).toHaveLength(4)
    inputs.forEach(i => { expect(i.type).toBe('password'); expect(i.value).toBe(''); expect(i.autocomplete).toBe('off') })
  })

  it('reports a failure to load', async () => {
    mockFetch.mockRejectedValue(new Error('Unauthorized'))
    render(<ApiKeysPanel />)
    expect(await screen.findByText('Unauthorized')).toBeInTheDocument()
  })
})

describe('ApiKeysPanel — saving', () => {
  it('disables Save until something is typed', async () => {
    await setup()
    const save = within(row('claude')).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    type('claude', '   ')
    expect(save).toBeDisabled()
    type('claude', SECRET)
    expect(save).toBeEnabled()
  })

  it('saves the trimmed key, updates the status, clears the input and tells the parent', async () => {
    mockSave.mockResolvedValue(status('claude', { configured: true, source: 'stored', last4: '1234', hasStored: true }))
    const { onChanged } = await setup()
    type('claude', `  ${SECRET} `)
    fireEvent.click(within(row('claude')).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByTestId('api-key-status-claude')).toHaveTextContent('Saved · ends in 1234'))
    expect(mockSave).toHaveBeenCalledWith('claude', SECRET)
    expect(within(row('claude')).getByLabelText('Anthropic (Claude)')).toHaveValue('') // the key leaves the page
    expect(within(row('claude')).getByRole('status')).toHaveTextContent('Key saved.')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('TOPSECRETVALUE')
  })

  it('saves with Enter', async () => {
    mockSave.mockResolvedValue(status('gemini', { configured: true, source: 'stored', last4: 'wxyz', hasStored: true }))
    await setup()
    type('gemini', 'AIzaSyGeminiKeyValue-wxyz')
    fireEvent.keyDown(within(row('gemini')).getByLabelText('Google Gemini'), { key: 'Enter' })
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('gemini', 'AIzaSyGeminiKeyValue-wxyz'))
  })

  it('shows the server message when saving fails, keeps what was typed, and does not notify the parent', async () => {
    mockSave.mockRejectedValue(new Error('That key is too short.'))
    const { onChanged } = await setup()
    type('claude', 'abc')
    fireEvent.click(within(row('claude')).getByRole('button', { name: 'Save' }))
    expect(await within(row('claude')).findByRole('alert')).toHaveTextContent('That key is too short.')
    expect(within(row('claude')).getByLabelText('Anthropic (Claude)')).toHaveValue('abc')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('passes the "run the migration" message through', async () => {
    mockSave.mockRejectedValue(new Error('The api_keys table is missing — run "npm run migrate" in server/ and try again.'))
    await setup()
    type('youtube', 'AIzaSyYoutubeKeyValue00001')
    fireEvent.click(within(row('youtube')).getByRole('button', { name: 'Save' }))
    expect(await within(row('youtube')).findByRole('alert')).toHaveTextContent('npm run migrate')
  })
})

describe('ApiKeysPanel — removing', () => {
  const saved = [status('claude', { configured: true, source: 'stored', last4: '1234', hasStored: true }), status('gemini'), status('youtube')]

  it('only offers Remove for a saved key', async () => {
    await setup(saved)
    expect(within(row('claude')).getByRole('button', { name: /Remove saved/ })).toBeInTheDocument()
    expect(within(row('gemini')).queryByRole('button', { name: /Remove saved/ })).not.toBeInTheDocument()
  })

  it('removes it, updates the status and tells the parent', async () => {
    mockRemove.mockResolvedValue(status('claude'))
    const { onChanged } = await setup(saved)
    fireEvent.click(within(row('claude')).getByRole('button', { name: /Remove saved/ }))
    await waitFor(() => expect(screen.getByTestId('api-key-status-claude')).toHaveTextContent('Not set'))
    expect(mockRemove).toHaveBeenCalledWith('claude')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(within(row('claude')).queryByRole('button', { name: /Remove saved/ })).not.toBeInTheDocument()
  })

  it('shows an error if removing fails', async () => {
    mockRemove.mockRejectedValue(new Error('Failed to remove the key'))
    await setup(saved)
    fireEvent.click(within(row('claude')).getByRole('button', { name: /Remove saved/ }))
    expect(await within(row('claude')).findByRole('alert')).toHaveTextContent('Failed to remove the key')
  })
})

describe('ApiKeysPanel — YouTube test', () => {
  const yt = (over: Partial<ApiKeyStatus> = {}) => [status('claude'), status('gemini'), status('youtube', { configured: true, source: 'stored', last4: '9999', hasStored: true, ...over })]

  it('is only available when a YouTube key is configured', async () => {
    await setup()
    expect(within(row('youtube')).getByRole('button', { name: 'Test' })).toBeDisabled()
  })

  it('reports success', async () => {
    mockTest.mockResolvedValue({ ok: true })
    await setup(yt())
    fireEvent.click(within(row('youtube')).getByRole('button', { name: 'Test' }))
    expect(await within(row('youtube')).findByText('The YouTube API accepted this key.')).toBeInTheDocument()
  })

  it('reports a failure with its kind', async () => {
    mockTest.mockResolvedValue({ ok: false, kind: 'quota', error: 'quota exceeded' })
    await setup(yt())
    fireEvent.click(within(row('youtube')).getByRole('button', { name: 'Test' }))
    expect(await within(row('youtube')).findByText('quota exceeded (quota)')).toBeInTheDocument()
  })

  it('reports a request that fails outright', async () => {
    mockTest.mockRejectedValue(new Error('Network down'))
    await setup(yt())
    fireEvent.click(within(row('youtube')).getByRole('button', { name: 'Test' }))
    expect(await within(row('youtube')).findByText(/Network down/)).toBeInTheDocument()
  })

  it('clears a stale result when the key changes', async () => {
    mockTest.mockResolvedValue({ ok: true })
    mockSave.mockResolvedValue(status('youtube', { configured: true, source: 'stored', last4: '0000', hasStored: true }))
    await setup(yt())
    fireEvent.click(within(row('youtube')).getByRole('button', { name: 'Test' }))
    await within(row('youtube')).findByText('The YouTube API accepted this key.')
    type('youtube', 'AIzaSyNewYoutubeKeyValue0000')
    fireEvent.click(within(row('youtube')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(within(row('youtube')).queryByText('The YouTube API accepted this key.')).not.toBeInTheDocument())
  })
})
