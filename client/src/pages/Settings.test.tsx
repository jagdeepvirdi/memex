import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
let mockTab: string | undefined
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ tab: mockTab }),
  Link: ({ children, to, ...rest }: any) => <a href={to} data-testid="mock-link" {...rest}>{children}</a>,
}))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: ({ activeSection }: any) => <div data-testid="mock-sidebar">Sidebar: {activeSection}</div>,
}))

vi.mock('../components/AppHeader', () => {
  const MockHeader = ({ left }: any) => (
    <div data-testid="mock-app-header">
      <div data-testid="left-slot">{left}</div>
    </div>
  )
  MockHeader.Spacer = () => <div data-testid="mock-app-header-spacer" />
  return { AppHeader: MockHeader }
})

const mockApiFetch = vi.fn()
const mockFetchCategories = vi.fn()
const mockReprocessBulk = vi.fn()
const mockFetchAiProviders = vi.fn()
const mockTestAiProvider = vi.fn()
const mockFetchApiKeys = vi.fn().mockResolvedValue([])

vi.mock('../lib/api', () => ({
  apiFetch: (url: string, init?: any) => init !== undefined ? mockApiFetch(url, init) : mockApiFetch(url),
  fetchCategories: () => mockFetchCategories(),
  reprocessBulk: (mode: string) => mockReprocessBulk(mode),
  fetchAiProviders: () => mockFetchAiProviders(),
  testAiProvider: (id: string) => mockTestAiProvider(id),
  fetchApiKeys: () => mockFetchApiKeys(),
  saveApiKey: vi.fn(),
  removeApiKey: vi.fn(),
  testYoutubeKey: vi.fn(),
}))

const mockDeriveKey = vi.fn()
const mockDecryptVaultItem = vi.fn()
const mockBase64ToUint8Array = vi.fn()

vi.mock('../lib/crypto', () => ({
  deriveKey: (password: string, salt: Uint8Array) => mockDeriveKey(password, salt),
  decryptVaultItem: (enc: string, iv: string, key: any) => mockDecryptVaultItem(enc, iv, key),
  base64ToUint8Array: (base64: string) => mockBase64ToUint8Array(base64),
}))

import SettingsPage from './Settings'

const renderTab = (tab?: string) => {
  mockTab = tab
  return render(<SettingsPage />)
}

describe('SettingsPage', () => {
  const mockCategories = [
    { id: 'cat1', name: 'Work', itemCount: 5 },
    { id: 'cat2', name: 'Personal', itemCount: 12 },
  ]

  const mockSettings = {
    ai_model: 'llama3.2',
    use_claude: false,
    auto_lock_timeout: '15',
    strict_local_mode: 'false',
    bookmarklet_key: 'initial-key-123',
  }

  const PROVIDERS = [
    { id: 'ollama', configured: true, cloud: false, models: ['llama3.2', 'gemma3:4b'] },
    { id: 'claude', configured: true, cloud: true, models: ['claude-sonnet-5-5'] },
    { id: 'gemini', configured: false, cloud: true, models: ['gemini-2.5-flash'] },
    { id: 'openai', configured: false, cloud: true, models: ['gpt-5.4-mini'] },
    { id: 'groq', configured: false, cloud: true, models: ['openai/gpt-oss-120b'] },
  ]

  /** Routes the calls every tab makes, then lets a test add or override endpoints. */
  const routes = (extra: (url: string, init?: any) => unknown = () => undefined, settings: Record<string, unknown> = mockSettings) =>
    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      const custom = extra(url, init)
      if (custom !== undefined) return custom
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return init?.method === 'PUT' ? { success: true } : settings
      return {}
    })

  beforeEach(() => {
    vi.clearAllMocks()
    mockTab = undefined

    // Mock global functions / window interfaces
    window.confirm = vi.fn().mockReturnValue(true)
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob')
    window.URL.revokeObjectURL = vi.fn()

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    })

    localStorage.setItem('memex-auth', JSON.stringify({ state: { token: 'test-jwt-token' } }))

    mockFetchCategories.mockResolvedValue(mockCategories)
    mockFetchAiProviders.mockResolvedValue(PROVIDERS)
    mockFetchApiKeys.mockResolvedValue([])
    routes()
  })

  // ── Shell: navigation between sections ────────────────────────────────────

  describe('shell and navigation', () => {
    it('shows the header and one link per section, with the AI section open by default', async () => {
      renderTab()
      expect(screen.getByText('System Settings')).toBeInTheDocument()
      const nav = screen.getByRole('navigation', { name: 'Settings sections' })
      const links = within(nav).getAllByRole('link')
      expect(links.map(l => l.getAttribute('href'))).toEqual([
        '/settings/ai', '/settings/privacy', '/settings/library', '/settings/vault', '/settings/capture',
      ])
      expect(within(nav).getByRole('link', { name: /^AI/ })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByTestId('settings-tab-ai')).toBeInTheDocument()
    })

    it.each([
      ['privacy', /Keys & Privacy/],
      ['library', /Library/],
      ['vault', /Vault/],
      ['capture', /Capture/],
    ])('opens the %s section from the URL and marks it current', async (tab, label) => {
      renderTab(tab)
      expect(screen.getByTestId(`settings-tab-${tab}`)).toBeInTheDocument()
      expect(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('link', { name: label }))
        .toHaveAttribute('aria-current', 'page')
      expect(screen.queryByTestId('settings-tab-ai')).toBeNull()
    })

    it('falls back to the AI section for an unknown tab', async () => {
      renderTab('nonsense')
      expect(screen.getByTestId('settings-tab-ai')).toBeInTheDocument()
    })

    it('only renders the open section, so the page stays short', async () => {
      renderTab('vault')
      expect(screen.queryByText('Categories')).toBeNull()
      expect(screen.queryByText('Bookmarklet')).toBeNull()
      expect(screen.queryByLabelText('AI provider')).toBeNull()
    })

    it('loads settings once for all sections', async () => {
      renderTab('vault')
      await waitFor(() => expect(screen.getByDisplayValue('15 Minutes')).toBeInTheDocument())
      expect(mockApiFetch.mock.calls.filter(c => c[0] === '/settings')).toHaveLength(1)
    })
  })

  describe('setup status strip', () => {
    it('says Ollama is answering by default', async () => {
      renderTab()
      await waitFor(() => expect(screen.getByTestId('setup-effective')).toHaveTextContent('Ollama (local) · llama3.2'))
      expect(screen.getByTestId('setup-status')).toHaveTextContent('Cloud AI off')
    })

    it('shows the cloud provider that will answer, and which keys exist', async () => {
      routes(undefined, { ...mockSettings, ai_provider: 'claude', allow_cloud: true })
      renderTab()
      await waitFor(() => expect(screen.getByTestId('setup-effective')).toHaveTextContent('Claude (cloud) · claude-sonnet-5-5'))
      expect(screen.getByTestId('setup-status')).toHaveTextContent('Cloud AI allowed')
      expect(screen.getByTestId('setup-status')).toHaveTextContent('Keys: Claude')
      expect(screen.queryByTestId('setup-fallback')).toBeNull()
    })

    it('explains a fallback to Ollama when the selected provider has no key', async () => {
      routes(undefined, { ...mockSettings, ai_provider: 'openai', allow_cloud: true })
      renderTab()
      await waitFor(() => expect(screen.getByTestId('setup-fallback')).toHaveTextContent(/OpenAI has no API key, so Ollama is used/))
      expect(screen.getByTestId('setup-effective')).toHaveTextContent('Ollama (local)')
    })

    it('explains a fallback to Ollama when cloud AI is not allowed', async () => {
      routes(undefined, { ...mockSettings, ai_provider: 'claude', allow_cloud: false })
      renderTab()
      await waitFor(() => expect(screen.getByTestId('setup-fallback')).toHaveTextContent(/cloud AI is not allowed/))
    })

    it('shows Strict Local Mode instead of the cloud chip', async () => {
      routes(undefined, { ...mockSettings, ai_provider: 'claude', allow_cloud: true, strict_local_mode: true })
      renderTab()
      await waitFor(() => expect(screen.getByTestId('setup-status')).toHaveTextContent('Strict Local Mode'))
      expect(screen.getByTestId('setup-effective')).toHaveTextContent('Ollama (local)')
      expect(screen.getByTestId('setup-status')).not.toHaveTextContent('Cloud AI')
    })

    it('still renders from the settings alone when the provider list cannot load', async () => {
      mockFetchAiProviders.mockRejectedValue(new Error('down'))
      renderTab()
      expect(screen.getByTestId('setup-effective')).toHaveTextContent('Ollama (local)')
    })
  })

  // ── AI ────────────────────────────────────────────────────────────────────

  describe('AI section', () => {
    it('shows the provider and model controls and the local Ollama card', async () => {
      renderTab('ai')
      expect(screen.getByText('Provider & model')).toBeInTheDocument()
      expect(screen.getByText('Local AI (Ollama)')).toBeInTheDocument()
      expect(screen.getByLabelText('AI provider')).toBeInTheDocument()
      // Strict Local Mode now lives with the keys and privacy rules, not here.
      expect(screen.queryByText('Strict Local Mode', { selector: 'p' })).toBeNull()
    })

    it('keeps per-task providers and connection tests collapsed under "Advanced"', async () => {
      renderTab('ai')
      const advanced = screen.getByTestId('ai-advanced') as HTMLDetailsElement
      expect(advanced.open).toBe(false)
      expect(within(advanced).getByText('Advanced')).toBeInTheDocument()
      expect(within(advanced).getByLabelText('Ask Memex provider')).toBeInTheDocument()
    })

    it('changes the local Ollama model from the installed-model list', async () => {
      renderTab('ai')
      await waitFor(() => expect(screen.getByRole('option', { name: 'gemma3:4b' })).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gemma3:4b' } })

      expect(mockApiFetch).toHaveBeenCalledWith('/settings', { method: 'PUT', body: JSON.stringify({ ai_model: 'gemma3:4b' }) })
    })

    it('selects a cloud provider via ai_provider (no longer the legacy use_claude flag)', async () => {
      renderTab('ai')
      await waitFor(() => expect(screen.getByTestId('provider-row-claude')).toHaveTextContent('Key configured'))

      fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'claude' } })

      expect(mockApiFetch).toHaveBeenCalledWith('/settings', { method: 'PUT', body: JSON.stringify({ ai_provider: 'claude' }) })
    })

    it('sends you to the key screen when the chosen provider has no key', async () => {
      routes(undefined, { ...mockSettings, ai_provider: 'openai', allow_cloud: true })
      renderTab('ai')
      const hint = await screen.findByTestId('missing-key-hint')
      expect(hint).toHaveTextContent('OpenAI has no API key yet')
      fireEvent.click(within(hint).getByRole('button', { name: 'Add a key' }))
      expect(mockNavigate).toHaveBeenCalledWith('/settings/privacy')
    })

    it('handles testing the Ollama connection', async () => {
      routes(url => (url === '/health/ollama' ? { status: 'ok' } : undefined))
      renderTab('ai')
      fireEvent.click(screen.getByRole('button', { name: /test ollama connection/i }))
      await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument())
      expect(mockApiFetch).toHaveBeenCalledWith('/health/ollama')
    })

    it('handles Ollama connection failure', async () => {
      routes(url => { if (url === '/health/ollama') throw new Error('Unreachable') })
      renderTab('ai')
      fireEvent.click(screen.getByRole('button', { name: /test ollama connection/i }))
      await waitFor(() => expect(screen.getByText('Ollama unreachable')).toBeInTheDocument())
    })
  })

  // ── Keys & Privacy ────────────────────────────────────────────────────────

  describe('Keys & Privacy section', () => {
    it('shows the key panel for every provider, empty by default', async () => {
      mockFetchApiKeys.mockResolvedValue(['claude', 'gemini', 'openai', 'groq', 'youtube'].map(provider => ({
        provider, label: provider, configured: false, source: null, hasStored: false, undecryptable: false,
      })))
      renderTab('privacy')
      await waitFor(() => expect(screen.getByTestId('api-key-status-openai')).toHaveTextContent('Not set'))
      expect(screen.getByTestId('api-keys-panel')).toBeInTheDocument()
    })

    it('lists what always stays on this machine', async () => {
      renderTab('privacy')
      expect(screen.getByText('Always stays on this machine')).toBeInTheDocument()
      expect(screen.getByText(/Passwords and the vault/)).toBeInTheDocument()
      expect(screen.getByText(/tagged private, no-cloud or local-only/)).toBeInTheDocument()
    })

    it('toggles Strict Local Mode and saves it as a real boolean', async () => {
      renderTab('privacy')
      const toggle = screen.getByRole('switch', { name: 'Strict Local Mode' })
      expect(toggle).not.toBeChecked()
      fireEvent.click(toggle)
      // Saved as a real boolean (older versions saved the string 'true').
      expect(mockApiFetch).toHaveBeenCalledWith('/settings', { method: 'PUT', body: JSON.stringify({ strict_local_mode: true }) })
    })

    it('reads an older string-valued Strict Local Mode', async () => {
      routes(undefined, { ...mockSettings, strict_local_mode: 'true' })
      renderTab('privacy')
      await waitFor(() => expect(screen.getByRole('switch', { name: 'Strict Local Mode' })).toBeChecked())
    })
  })

  // ── Library ───────────────────────────────────────────────────────────────

  describe('Library section', () => {
    it('lists categories with their item counts', async () => {
      renderTab('library')
      await waitFor(() => {
        expect(screen.getByText('Work')).toBeInTheDocument()
        expect(screen.getByText('5 items')).toBeInTheDocument()
        expect(screen.getByText('Personal')).toBeInTheDocument()
        expect(screen.getByText('12 items')).toBeInTheDocument()
      })
      expect(screen.getByText('Import & export')).toBeInTheDocument()
      expect(screen.getByText('Processing')).toBeInTheDocument()
    })

    it('allows category deletion', async () => {
      routes((url, init) => (url === '/categories/cat1' && init?.method === 'DELETE' ? { success: true } : undefined))
      renderTab('library')
      await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }))

      expect(window.confirm).toHaveBeenCalledWith('Delete this category? (Only works if empty and no subcategories)')
      expect(mockApiFetch).toHaveBeenCalledWith('/categories/cat1', { method: 'DELETE' })
    })

    it('does not delete when the confirmation is declined', async () => {
      window.confirm = vi.fn().mockReturnValue(false)
      renderTab('library')
      await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }))
      expect(mockApiFetch).not.toHaveBeenCalledWith('/categories/cat1', { method: 'DELETE' })
    })

    it('allows category renaming', async () => {
      routes((url, init) => (url === '/categories/cat1' && init?.method === 'PUT' ? { success: true } : undefined))
      renderTab('library')
      await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Rename Work' }))
      fireEvent.change(screen.getByDisplayValue('Work'), { target: { value: 'Work Project' } })
      fireEvent.click(screen.getByRole('button', { name: /save category name/i }))

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/categories/cat1', { method: 'PUT', body: JSON.stringify({ name: 'Work Project' }) })
      })
    })

    it('handles exporting workspace data as JSON', async () => {
      routes(url => (url === '/items' ? [{ id: '1', title: 'Exported Item' }] : undefined))
      renderTab('library')

      fireEvent.click(screen.getByRole('button', { name: /export json/i }))

      await waitFor(() => expect(screen.getByText('Data exported successfully')).toBeInTheDocument())
      expect(mockApiFetch).toHaveBeenCalledWith('/items')
      expect(window.URL.createObjectURL).toHaveBeenCalled()
    })

    it('handles exporting Obsidian vault', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['fake zip content'], { type: 'application/zip' }),
      })
      window.fetch = mockFetch
      renderTab('library')

      fireEvent.click(screen.getByRole('button', { name: /export obsidian/i }))

      await waitFor(() => expect(screen.getByText('Obsidian vault exported')).toBeInTheDocument())
      expect(mockFetch).toHaveBeenCalledWith('/api/items/export/obsidian', expect.any(Object))
    })

    it('shows an error when the Obsidian export fails', async () => {
      window.fetch = vi.fn().mockResolvedValue({ ok: false })
      renderTab('library')
      fireEvent.click(screen.getByRole('button', { name: /export obsidian/i }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Obsidian export failed'))
    })

    it('runs AI enrichment manually', async () => {
      routes((url, init) => {
        if (url === '/items/enrich' && init?.method === 'POST') return { queued: 5 }
        if (url === '/items/enrichment') return { pending: 3, total: 10 }
        return undefined
      })
      renderTab('library')

      const enrichBtn = await screen.findByRole('button', { name: /re-run enrichment/i })
      fireEvent.click(enrichBtn)

      await waitFor(() => expect(screen.getByText(/Re-queued 5 notes for AI classification/i)).toBeInTheDocument())
    })

    it('reprocesses unreviewed items in bulk', async () => {
      mockReprocessBulk.mockResolvedValue({ queued: 4 })
      renderTab('library')

      fireEvent.click(await screen.findByRole('button', { name: /re-process/i }))

      await waitFor(() => expect(screen.getByText(/Re-processing 4 items with the current model/i)).toBeInTheDocument())
      expect(mockReprocessBulk).toHaveBeenCalledWith('unreviewed')
    })

    it('shows how to install MarkItDown when it is missing', async () => {
      routes(url => (url === '/ingest/markitdown/health' ? { installed: false } : undefined))
      renderTab('library')
      await waitFor(() => expect(screen.getByText('Not installed')).toBeInTheDocument())
      expect(screen.getByText(/pip install 'markitdown\[all\]'/)).toBeInTheDocument()
    })
  })

  // ── Vault ─────────────────────────────────────────────────────────────────

  describe('Vault section', () => {
    it('updates the auto-lock timeout', async () => {
      renderTab('vault')
      const timeoutSelect = await screen.findByDisplayValue('15 Minutes')
      fireEvent.change(timeoutSelect, { target: { value: '60' } })
      expect(mockApiFetch).toHaveBeenCalledWith('/settings', { method: 'PUT', body: JSON.stringify({ auto_lock_timeout: '60' }) })
    })

    it('links to the vault for a password change', async () => {
      renderTab('vault')
      expect(screen.getByRole('link', { name: /go to vault/i })).toHaveAttribute('href', '/vault')
    })

    it('can open Vault Reset Confirmation modal, verify password and submit reset', async () => {
      const dummyKey = { type: 'key' }
      mockBase64ToUint8Array.mockReturnValue(new Uint8Array([1, 2, 3]))
      mockDeriveKey.mockResolvedValue(dummyKey)
      mockDecryptVaultItem.mockResolvedValue('memex-vault-v1')

      routes((url, init) => {
        if (url === '/vault/status') return { hasSetup: true, salt: 'c2FsdA==', verifier: 'verifier', verifierIv: 'iv' }
        if (url === '/vault/reset' && init?.method === 'POST') {
          expect(JSON.parse(init.body)).toEqual({ verifiedSentinel: 'memex-vault-v1' })
          return { success: true }
        }
        return undefined
      })
      renderTab('vault')

      fireEvent.click(screen.getByRole('button', { name: /reset vault/i }))
      expect(screen.getByText('Reset Vault?')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText('Vault password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/vault/reset', {
          method: 'POST',
          body: JSON.stringify({ verifiedSentinel: 'memex-vault-v1' }),
        })
        expect(screen.getByText(/Vault reset — all secrets deleted and password cleared/i)).toBeInTheDocument()
      })
      expect(screen.queryByText('Reset Vault?')).toBeNull()
    })

    it('rejects a wrong vault password without resetting anything', async () => {
      mockBase64ToUint8Array.mockReturnValue(new Uint8Array([1]))
      mockDeriveKey.mockResolvedValue({})
      mockDecryptVaultItem.mockRejectedValue(new Error('bad decrypt'))
      routes(url => (url === '/vault/status' ? { hasSetup: true, salt: 's', verifier: 'v', verifierIv: 'i' } : undefined))
      renderTab('vault')

      fireEvent.click(screen.getByRole('button', { name: /reset vault/i }))
      fireEvent.change(screen.getByPlaceholderText('Vault password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))

      await waitFor(() => expect(screen.getByText('Incorrect vault password')).toBeInTheDocument())
      expect(mockApiFetch).not.toHaveBeenCalledWith('/vault/reset', expect.anything())
    })

    it('cancels the reset dialog', async () => {
      renderTab('vault')
      fireEvent.click(screen.getByRole('button', { name: /reset vault/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByText('Reset Vault?')).toBeNull()
    })
  })

  // ── Capture ───────────────────────────────────────────────────────────────

  describe('Capture section', () => {
    it('supports generating and copying bookmarklet key', async () => {
      routes((url, init) => (url === '/settings/bookmarklet-key' && init?.method === 'POST' ? { key: 'new-generated-key-999' } : undefined))
      renderTab('capture')

      // The saved key arrives with the settings.
      const copyBtn = await screen.findByRole('button', { name: /copy bookmarklet link/i })
      fireEvent.click(copyBtn)
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('initial-key-123'))
      expect(screen.getByText('Copied!')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /regenerate key/i }))
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/settings/bookmarklet-key', { method: 'POST' }))
      // The button still reads "Copied!" for a moment after the first copy.
      fireEvent.click(await screen.findByRole('button', { name: /copied!|copy bookmarklet link/i }))
      await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining('new-generated-key-999')))
    })

    it('offers to generate a bookmarklet when there is no key yet', async () => {
      const { bookmarklet_key: _omit, ...withoutKey } = mockSettings
      routes(undefined, withoutKey)
      renderTab('capture')
      expect(await screen.findByRole('button', { name: /generate bookmarklet/i })).toBeInTheDocument()
    })

    it('includes the YouTube backfill', async () => {
      renderTab('capture')
      expect(screen.getByText('YouTube backfill')).toBeInTheDocument()
    })
  })
})
