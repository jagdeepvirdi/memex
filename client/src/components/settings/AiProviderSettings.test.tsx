import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const mockFetchAiProviders = vi.fn()
const mockTestAiProvider = vi.fn()
const mockFetchApiKeys = vi.fn().mockResolvedValue([])
vi.mock('../../lib/api', () => ({
  fetchAiProviders: () => mockFetchAiProviders(),
  testAiProvider: (id: string) => mockTestAiProvider(id),
  fetchApiKeys: () => mockFetchApiKeys(),
  saveApiKey: vi.fn(),
  removeApiKey: vi.fn(),
  testYoutubeKey: vi.fn(),
}))

import { AiProviderSettings } from './AiProviderSettings'

const PROVIDERS = [
  { id: 'ollama', configured: true, cloud: false, models: ['llama3.2', 'gemma3:4b'] },
  { id: 'claude', configured: true, cloud: true, models: ['claude-sonnet-5-5', 'claude-opus-5-5'] },
  { id: 'gemini', configured: false, cloud: true, models: ['gemini-2.5-flash'] },
  { id: 'openai', configured: false, cloud: true, models: ['gpt-5.4-mini', 'gpt-5.2'] },
]

const onUpdate = vi.fn()
const setup = async (settings: Record<string, unknown> = {}) => {
  const utils = render(<AiProviderSettings settings={settings} onUpdate={onUpdate} />)
  await waitFor(() => expect(screen.getByTestId('provider-row-claude')).toHaveTextContent(/key configured/i))
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAiProviders.mockResolvedValue(PROVIDERS)
})

describe('AiProviderSettings — OpenAI', () => {
  it('offers OpenAI as a provider and saves the choice', async () => {
    await setup({})
    expect(within(screen.getByLabelText('AI provider')).getByRole('option', { name: /OpenAI \(cloud\)/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'openai' } })
    expect(onUpdate).toHaveBeenCalledWith({ ai_provider: 'openai' })
  })

  it('stores the OpenAI model under openai_model and suggests its models', async () => {
    await setup({ ai_provider: 'openai', allow_cloud: true, openai_model: 'gpt-5.4-mini' })
    const input = screen.getByLabelText('Model') as HTMLInputElement
    expect(input.value).toBe('gpt-5.4-mini')
    fireEvent.change(input, { target: { value: 'gpt-5.2' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith({ openai_model: 'gpt-5.2' })
  })

  it('offers OpenAI per task and can test it once a key exists', async () => {
    await setup({})
    expect(within(screen.getByLabelText('Ask Memex provider')).getByRole('option', { name: /OpenAI/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test OpenAI' })).toBeDisabled()
  })

  it('runs the OpenAI connection test and reports the model', async () => {
    mockFetchAiProviders.mockResolvedValue(PROVIDERS.map(p => (p.id === 'openai' ? { ...p, configured: true } : p)))
    mockTestAiProvider.mockResolvedValue({ ok: true, provider: 'openai', model: 'gpt-5.4-mini', latencyMs: 640 })
    await setup({ ai_provider: 'openai', allow_cloud: true })
    fireEvent.click(screen.getByRole('button', { name: 'Test OpenAI' }))
    await waitFor(() => expect(screen.getByTestId('provider-row-openai')).toHaveTextContent('Working · gpt-5.4-mini · 640 ms'))
    expect(mockTestAiProvider).toHaveBeenCalledWith('openai')
  })
})

describe('AiProviderSettings — provider and model', () => {
  it('defaults to local Ollama', async () => {
    await setup({})
    expect(screen.getByLabelText('AI provider')).toHaveValue('ollama')
    expect(screen.getByLabelText('Model')).toHaveValue('llama3.2')
    expect(screen.getByLabelText('Allow cloud AI')).not.toBeChecked()
  })

  it('reads a legacy use_claude=true install as Claude with cloud consent', async () => {
    await setup({ use_claude: true })
    expect(screen.getByLabelText('AI provider')).toHaveValue('claude')
    expect(screen.getByLabelText('Allow cloud AI')).toBeChecked()
  })

  it('prefers ai_provider / allow_cloud over the legacy flag', async () => {
    await setup({ use_claude: true, ai_provider: 'ollama', allow_cloud: false })
    expect(screen.getByLabelText('AI provider')).toHaveValue('ollama')
    expect(screen.getByLabelText('Allow cloud AI')).not.toBeChecked()
  })

  it('saves a provider change', async () => {
    await setup({})
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'claude' } })
    expect(onUpdate).toHaveBeenCalledWith({ ai_provider: 'claude' })
  })

  it('disables providers without an API key (but never the one already selected)', async () => {
    await setup({})
    const select = within(screen.getByLabelText('AI provider'))
    expect(select.getByRole('option', { name: /Gemini \(cloud\) — no API key/ })).toBeDisabled()
    expect(select.getByRole('option', { name: 'Claude (cloud)' })).toBeEnabled()
  })

  it('keeps a keyless provider selectable once it is already selected', async () => {
    await setup({ ai_provider: 'gemini', allow_cloud: true })
    const select = within(screen.getByLabelText('AI provider'))
    expect(select.getByRole('option', { name: /Gemini/ })).toBeEnabled()
  })

  it('picks an Ollama model from the installed list', async () => {
    await setup({})
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gemma3:4b' } })
    expect(onUpdate).toHaveBeenCalledWith({ ai_model: 'gemma3:4b' })
  })

  it('edits a cloud model as free text and saves once on blur', async () => {
    await setup({ ai_provider: 'claude', allow_cloud: true })
    const input = screen.getByLabelText('Model')
    fireEvent.change(input, { target: { value: 'claude-opus-5-5' } })
    expect(onUpdate).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith({ claude_model: 'claude-opus-5-5' })
  })

  it('does not save an empty or unchanged cloud model', async () => {
    await setup({ ai_provider: 'gemini', allow_cloud: true, gemini_model: 'gemini-x' })
    const input = screen.getByLabelText('Model')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.blur(input)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(input).toHaveValue('gemini-x')
  })
})

describe('AiProviderSettings — cloud consent', () => {
  it('saves consent as a real boolean', async () => {
    await setup({})
    fireEvent.click(screen.getByLabelText('Allow cloud AI'))
    expect(onUpdate).toHaveBeenCalledWith({ allow_cloud: true })
  })

  it('warns when a cloud provider is selected without consent', async () => {
    await setup({ ai_provider: 'claude', allow_cloud: false })
    expect(screen.getByRole('alert')).toHaveTextContent(/still runs locally/i)
  })

  it('warns for a cloud per-task override even when the default is local', async () => {
    await setup({ ai_task_providers: { ask: 'claude' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows no warning when consent is on, or nothing cloud is selected', async () => {
    await setup({ ai_provider: 'claude', allow_cloud: true })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('AiProviderSettings — strict local mode', () => {
  it.each([true, 'true'])('locks everything to local when strict_local_mode is %j', async (v) => {
    await setup({ strict_local_mode: v, ai_provider: 'claude', allow_cloud: true, ai_task_providers: { ask: 'gemini' } })
    expect(screen.getByText(/Strict Local Mode is on/)).toBeInTheDocument()
    expect(screen.getByLabelText('AI provider')).toHaveValue('ollama')
    expect(screen.getByLabelText('AI provider')).toBeDisabled()
    expect(screen.getByLabelText('Allow cloud AI')).toBeDisabled()
    expect(screen.getByLabelText('Allow cloud AI')).not.toBeChecked()
    expect(screen.getByLabelText('Ask Memex provider')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Test Claude' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("treats the string 'false' as off", async () => {
    await setup({ strict_local_mode: 'false' })
    expect(screen.queryByText(/Strict Local Mode is on/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('AI provider')).toBeEnabled()
  })
})

describe('AiProviderSettings — per-task providers', () => {
  it('shows the default and any override', async () => {
    await setup({ ai_task_providers: { insights: 'ollama' } })
    expect(screen.getByLabelText('Insights provider')).toHaveValue('ollama')
    expect(screen.getByLabelText('Ask Memex provider')).toHaveValue('')
    expect(screen.getAllByRole('option', { name: 'Default (Ollama (local))' }).length).toBeGreaterThan(0)
  })

  it('adds an override while keeping the existing ones', async () => {
    await setup({ ai_task_providers: { insights: 'ollama' } })
    fireEvent.change(screen.getByLabelText('Ask Memex provider'), { target: { value: 'claude' } })
    expect(onUpdate).toHaveBeenCalledWith({ ai_task_providers: { insights: 'ollama', ask: 'claude' } })
  })

  it('removes an override when set back to Default', async () => {
    await setup({ ai_task_providers: { insights: 'ollama', ask: 'claude' } })
    fireEvent.change(screen.getByLabelText('Ask Memex provider'), { target: { value: '' } })
    expect(onUpdate).toHaveBeenCalledWith({ ai_task_providers: { insights: 'ollama' } })
  })

  it('ignores a malformed stored value', async () => {
    await setup({ ai_task_providers: ['claude'] })
    expect(screen.getByLabelText('Ask Memex provider')).toHaveValue('')
  })
})

describe('AiProviderSettings — provider status and connection test', () => {
  it('shows key status per provider and never a key', async () => {
    const { container } = await setup({})
    expect(screen.getByTestId('provider-row-ollama')).toHaveTextContent(/always available/i)
    expect(screen.getByTestId('provider-row-claude')).toHaveTextContent(/key configured/i)
    expect(screen.getByTestId('provider-row-gemini')).toHaveTextContent(/no api key/i)
    expect(screen.getByTestId('provider-row-openai')).toHaveTextContent(/no api key/i)
    // The rows only report status. Keys are entered on the Keys & Privacy screen, so no key field exists here.
    for (const id of ['ollama', 'claude', 'gemini', 'openai']) {
      expect(within(screen.getByTestId(`provider-row-${id}`)).queryByLabelText(/key/i, { selector: 'input' })).toBeNull()
    }
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(0)
  })

  it('cannot test a provider with no key', async () => {
    await setup({})
    expect(screen.getByRole('button', { name: 'Test Gemini' })).toBeDisabled()
  })

  it('reports a successful test with model and latency', async () => {
    mockTestAiProvider.mockResolvedValue({ ok: true, provider: 'claude', model: 'claude-sonnet-5-5', latencyMs: 812 })
    await setup({ ai_provider: 'claude', allow_cloud: true })
    fireEvent.click(screen.getByRole('button', { name: 'Test Claude' }))
    await waitFor(() => expect(screen.getByTestId('provider-row-claude')).toHaveTextContent('Working · claude-sonnet-5-5 · 812 ms'))
    expect(mockTestAiProvider).toHaveBeenCalledWith('claude')
  })

  it('shows a failed test with its reason', async () => {
    mockTestAiProvider.mockResolvedValue({ ok: false, provider: 'claude', kind: 'rate_limit', error: 'slow down' })
    await setup({ ai_provider: 'claude', allow_cloud: true })
    fireEvent.click(screen.getByRole('button', { name: 'Test Claude' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('slow down (rate limit)'))
  })

  it('surfaces a blocked test (e.g. cloud not allowed)', async () => {
    mockTestAiProvider.mockResolvedValue({
      ok: false, provider: 'claude', kind: 'blocked', error: 'Cannot use claude: cloud AI is not enabled in Settings',
    })
    await setup({})
    fireEvent.click(screen.getByRole('button', { name: 'Test Claude' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/cloud AI is not enabled/))
  })

  it('handles a request that throws', async () => {
    mockTestAiProvider.mockRejectedValue(new Error('Network down'))
    await setup({})
    fireEvent.click(screen.getByRole('button', { name: 'Test Ollama' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Network down'))
  })

  it('disables the other test buttons while one is running', async () => {
    let resolve!: (v: unknown) => void
    mockTestAiProvider.mockReturnValue(new Promise(r => { resolve = r }))
    await setup({})
    fireEvent.click(screen.getByRole('button', { name: 'Test Ollama' }))
    expect(screen.getByRole('button', { name: 'Test Claude' })).toBeDisabled()
    resolve({ ok: true, provider: 'ollama', model: 'llama3.2', latencyMs: 5 })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test Claude' })).toBeEnabled())
  })
})

describe('AiProviderSettings — provider list failure', () => {
  it('still renders the controls and shows an error when the list cannot load', async () => {
    mockFetchAiProviders.mockRejectedValue(new Error('boom'))
    render(<AiProviderSettings settings={{}} onUpdate={onUpdate} />)
    await waitFor(() => expect(screen.getByText(/couldn't load provider status/i)).toBeInTheDocument())
    expect(screen.getByLabelText('AI provider')).toBeInTheDocument()
  })
})

describe('AiProviderSettings — a provider with no key', () => {
  const openaiNoKey = { ai_provider: 'openai', allow_cloud: true }

  it('says so, and offers a shortcut to the key screen', async () => {
    const onOpenKeys = vi.fn()
    render(<AiProviderSettings settings={openaiNoKey} onUpdate={onUpdate} onOpenKeys={onOpenKeys} />)
    const hint = await screen.findByTestId('missing-key-hint')
    expect(hint).toHaveTextContent('OpenAI has no API key yet')
    fireEvent.click(within(hint).getByRole('button', { name: 'Add a key' }))
    expect(onOpenKeys).toHaveBeenCalledTimes(1)
  })

  it('still explains the problem when there is no shortcut to offer', async () => {
    render(<AiProviderSettings settings={openaiNoKey} onUpdate={onUpdate} />)
    const hint = await screen.findByTestId('missing-key-hint')
    expect(hint).toHaveTextContent('OpenAI has no API key yet')
    expect(within(hint).queryByRole('button')).toBeNull()
  })

  it.each([
    ['the provider has a key', { ai_provider: 'claude', allow_cloud: true }],
    ['the provider is local Ollama', { ai_provider: 'ollama' }],
    ['Strict Local Mode is on', { ...openaiNoKey, strict_local_mode: true }],
  ])('stays quiet when %s', async (_name, settings) => {
    await setup(settings)
    expect(screen.queryByTestId('missing-key-hint')).toBeNull()
  })

  it('points to Keys & Privacy when Strict Local Mode is on', async () => {
    await setup({ strict_local_mode: true })
    expect(screen.getByText(/Strict Local Mode is on/)).toHaveTextContent('Keys & Privacy')
  })
})

describe('AiProviderSettings — Advanced section', () => {
  it('is collapsed by default and holds the per-task providers and connection tests', async () => {
    await setup({})
    const advanced = screen.getByTestId('ai-advanced') as HTMLDetailsElement
    expect(advanced.open).toBe(false)
    expect(within(advanced).getByLabelText('Classification provider')).toBeInTheDocument()
    expect(within(advanced).getByTestId('provider-row-openai')).toBeInTheDocument()
    // The everyday controls stay outside it.
    expect(within(advanced).queryByLabelText('AI provider')).toBeNull()
    expect(within(advanced).queryByLabelText('Allow cloud AI')).toBeNull()
  })
})
