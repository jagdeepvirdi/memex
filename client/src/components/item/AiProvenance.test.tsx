import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/api', async (orig) => ({
  ...(await orig<typeof import('../../lib/api')>()),
  fetchAiProviders: vi.fn(),
}))

import { AiBadge, ReClassifyControl, describeExtractionModel } from './AiProvenance'
import { fetchAiProviders } from '../../lib/api'
import type { AiProviderInfo } from '../../lib/api'

const PROVIDERS: AiProviderInfo[] = [
  { id: 'ollama', configured: true, cloud: false, models: [] },
  { id: 'claude', configured: false, cloud: true, models: [] },
  { id: 'gemini', configured: true, cloud: true, models: [] },
  { id: 'openai', configured: false, cloud: true, models: [] },
  { id: 'groq', configured: true, cloud: true, models: [] },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchAiProviders).mockResolvedValue(PROVIDERS)
})

describe('describeExtractionModel', () => {
  it.each([
    ['gemini:gemini-3.8-flash', { provider: 'gemini', model: 'gemini-3.8-flash', name: 'Gemini', cloud: true }],
    ['openai:gpt-5.4-mini', { provider: 'openai', model: 'gpt-5.4-mini', name: 'OpenAI', cloud: true }],
    ['groq:openai/gpt-oss-120b', { provider: 'groq', model: 'openai/gpt-oss-120b', name: 'Groq', cloud: true }],
    ['claude:claude-sonnet-5-5', { provider: 'claude', model: 'claude-sonnet-5-5', name: 'Claude', cloud: true }],
    ['ollama:llama3.2', { provider: 'ollama', model: 'llama3.2', name: 'Ollama', cloud: false }],
  ])('reads %s', (label, expected) => expect(describeExtractionModel(label)).toEqual(expected))

  it('keeps a model id that itself contains a colon', () => {
    expect(describeExtractionModel('ollama:gemma3:4b')).toMatchObject({ provider: 'ollama', model: 'gemma3:4b', cloud: false })
  })

  it('treats an unknown provider as cloud (it is not Ollama) and shows its name', () => {
    expect(describeExtractionModel('mistral:large')).toMatchObject({ name: 'mistral', cloud: true })
  })

  it('treats an old record with no provider as a model of an unknown AI that was not sent anywhere we know of', () => {
    expect(describeExtractionModel('llama3.2')).toMatchObject({ provider: 'unknown', model: 'llama3.2', name: 'an AI', cloud: false })
  })

  it.each([undefined, null, '', '   '])('returns null for %j', (v) => expect(describeExtractionModel(v)).toBeNull())
})

describe('AiBadge', () => {
  it('says a cloud AI answered, and that the text was sent to it', () => {
    render(<AiBadge item={{ extractionModel: 'gemini:gemini-3.8-flash' }} />)
    const badge = screen.getByTestId('ai-badge')
    expect(badge).toHaveTextContent('Classified by Gemini')
    expect(badge).toHaveTextContent('gemini-3.8-flash')
    expect(badge).toHaveAttribute('title', expect.stringMatching(/sent to Gemini/))
  })

  it('says a local AI answered and that nothing was sent anywhere', () => {
    render(<AiBadge item={{ extractionModel: 'ollama:llama3.2' }} />)
    const badge = screen.getByTestId('ai-badge')
    expect(badge).toHaveTextContent('Classified locally')
    expect(badge).toHaveAttribute('title', expect.stringMatching(/Nothing was sent anywhere/))
  })

  it('says so when there is no record, instead of guessing', () => {
    render(<AiBadge item={{}} />)
    expect(screen.getByTestId('ai-badge')).toHaveTextContent('AI: not recorded')
  })

  it('shows why an item stays on this machine', () => {
    render(<AiBadge item={{ extractionModel: 'ollama:llama3.2', localOnly: { reason: 'content', message: 'Its text looks like it contains account details.' } }} />)
    const chip = screen.getByTestId('local-only-badge')
    expect(chip).toHaveTextContent('Stays on this machine')
    expect(chip).toHaveAttribute('title', 'Its text looks like it contains account details.')
  })

  it('shows no local-only chip for an ordinary item', () => {
    render(<AiBadge item={{ extractionModel: 'gemini:gemini-3.8-flash' }} />)
    expect(screen.queryByTestId('local-only-badge')).not.toBeInTheDocument()
  })
})

describe('ReClassifyControl', () => {
  const setup = (over: Partial<React.ComponentProps<typeof ReClassifyControl>> = {}) => {
    const onRun = vi.fn()
    render(<ReClassifyControl item={{}} busy={false} onRun={onRun} {...over} />)
    return onRun
  }
  const select = () => screen.getByLabelText('Re-classify with') as HTMLSelectElement
  const option = (name: RegExp) => within(select()).getByRole('option', { name }) as HTMLOptionElement

  it('re-classifies with the default AI unless you pick another', () => {
    const onRun = setup()
    fireEvent.click(screen.getByRole('button', { name: /Re-classify/ }))
    expect(onRun).toHaveBeenCalledWith(undefined)
  })

  it('pins the run to the provider you pick', async () => {
    const onRun = setup()
    await waitFor(() => expect(fetchAiProviders).toHaveBeenCalled())
    fireEvent.change(select(), { target: { value: 'gemini' } })
    fireEvent.click(screen.getByRole('button', { name: /Re-classify/ }))
    expect(onRun).toHaveBeenCalledWith('gemini')
  })

  it('offers every provider, local first in the list of choices after the default', () => {
    setup()
    expect(within(select()).getAllByRole('option').map(o => o.textContent)).toEqual([
      'Default AI', 'Ollama (local)', 'Claude (cloud)', 'Gemini (cloud)', 'OpenAI (cloud)', 'Groq (cloud)',
    ])
  })

  it('disables a cloud provider that has no key, and says so', async () => {
    setup()
    await waitFor(() => expect(option(/Claude/).disabled).toBe(true))
    expect(option(/Claude/).textContent).toBe('Claude (cloud) (no key)')
    expect(option(/OpenAI/).disabled).toBe(true)
    expect(option(/Gemini/).disabled).toBe(false)
    expect(option(/Groq/).disabled).toBe(false)
    expect(option(/Ollama/).disabled).toBe(false)
  })

  it('offers only the local AI for an item that stays on this machine', async () => {
    setup({ item: { localOnly: { reason: 'tag', message: 'x' } } })
    await waitFor(() => expect(option(/Gemini/).disabled).toBe(true))
    expect(option(/Gemini/).textContent).toBe('Gemini (cloud) (private item)')
    expect(option(/Groq/).disabled).toBe(true)
    expect(option(/Ollama/).disabled).toBe(false)
  })

  it('keeps working when the provider list cannot be loaded (cloud choices stay enabled; the server decides)', async () => {
    vi.mocked(fetchAiProviders).mockRejectedValue(new Error('offline'))
    setup()
    await waitFor(() => expect(fetchAiProviders).toHaveBeenCalled())
    expect(option(/Gemini/).disabled).toBe(false)
  })

  it('locks both controls while it runs', () => {
    setup({ busy: true })
    expect(select()).toBeDisabled()
    expect(screen.getByRole('button', { name: /Re-classify/ })).toBeDisabled()
  })
})
