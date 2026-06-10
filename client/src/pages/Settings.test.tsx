import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: any) => <a href={to} data-testid="mock-link">{children}</a>,
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

vi.mock('../lib/api', () => ({
  apiFetch: (url: string, init?: any) => init !== undefined ? mockApiFetch(url, init) : mockApiFetch(url),
  fetchCategories: () => mockFetchCategories(),
  reprocessBulk: (mode: string) => mockReprocessBulk(mode),
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

describe('SettingsPage Component', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock global functions / window interfaces
    window.confirm = vi.fn().mockReturnValue(true)
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob')
    window.URL.revokeObjectURL = vi.fn()

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    })

    localStorage.setItem('memex-auth', JSON.stringify({ state: { token: 'test-jwt-token' } }))

    // Default API resolves
    mockFetchCategories.mockResolvedValue(mockCategories)
    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/items/enrichment') {
        return { pending: 2, total: 10 }
      }
      if (url === '/ingest/markitdown/health') {
        return { installed: true }
      }
      if (url === '/settings') {
        if (init?.method === 'PUT') {
          return { success: true }
        }
        return mockSettings
      }
      throw new Error(`Unhandled apiFetch call in mock: ${url}`)
    })
  })

  it('renders initial settings, categories, and panels', async () => {
    render(<SettingsPage />)

    // Wait for categories and settings to load
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('5 items')).toBeInTheDocument()
      expect(screen.getByText('Personal')).toBeInTheDocument()
      expect(screen.getByText('12 items')).toBeInTheDocument()
    })

    expect(screen.getByText('System Settings')).toBeInTheDocument()
    expect(screen.getByText('Intelligence Engine')).toBeInTheDocument()
    expect(screen.getByText('Strict Local Mode')).toBeInTheDocument()
  })

  it('handles changing the AI model setting', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    const select = screen.getAllByRole('combobox')[0] // primary model select tag
    fireEvent.change(select, { target: { value: 'gemma2:2b' } })

    expect(mockApiFetch).toHaveBeenCalledWith('/settings', {
      method: 'PUT',
      body: JSON.stringify({ use_claude: false, ai_model: 'gemma2:2b' }),
    })
  })

  it('handles changing to Claude Sonnet cloud model', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: 'claude-3-5-sonnet' } })

    expect(mockApiFetch).toHaveBeenCalledWith('/settings', {
      method: 'PUT',
      body: JSON.stringify({ use_claude: true }),
    })
  })

  it('handles testing the Ollama connection', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/health/ollama') return { status: 'ok' }
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    const btn = screen.getByRole('button', { name: /test ollama connection/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
    expect(mockApiFetch).toHaveBeenCalledWith('/health/ollama')
  })

  it('handles Ollama connection failure', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/health/ollama') throw new Error('Unreachable')
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    const btn = screen.getByRole('button', { name: /test ollama connection/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(screen.getByText('Ollama unreachable')).toBeInTheDocument()
    })
  })

  it('allows category deletion', async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/categories/cat1' && init?.method === 'DELETE') {
        return { success: true }
      }
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    // Hover is represented in test-library by just finding the button.
    // Lucide Trash2 is rendered as a button without text, we can find it by getting all buttons or using container query
    const workContainer = screen.getByText('Work').closest('.group')!
    const trashBtn = workContainer.querySelector('button:last-child')!

    fireEvent.click(trashBtn)

    expect(window.confirm).toHaveBeenCalledWith('Delete this category? (Only works if empty and no subcategories)')
    expect(mockApiFetch).toHaveBeenCalledWith('/categories/cat1', { method: 'DELETE' })
  })

  it('allows category renaming', async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/categories/cat1' && init?.method === 'PUT') {
        expect(JSON.parse(init.body)).toEqual({ name: 'Work Project' })
        return { success: true }
      }
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    const workContainer = screen.getByText('Work').closest('.group')!
    const editBtn = workContainer.querySelector('button:first-child')!

    fireEvent.click(editBtn)

    // The input should now be visible
    const input = screen.getByDisplayValue('Work')
    fireEvent.change(input, { target: { value: 'Work Project' } })

    const saveBtn = screen.getByRole('button', { name: /save category name/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/categories/cat1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Work Project' }),
      })
    })
  })

  it('handles exporting workspace data as JSON', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/items') return [{ id: '1', title: 'Exported Item' }]
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    const exportBtn = screen.getByRole('button', { name: /export json/i })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(screen.getByText('Data exported successfully')).toBeInTheDocument()
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/items')
    expect(window.URL.createObjectURL).toHaveBeenCalled()
  })

  it('handles exporting Obsidian vault', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['fake zip content'], { type: 'application/zip' }),
    })
    window.fetch = mockFetch

    render(<SettingsPage />)

    const obsidianBtn = screen.getByRole('button', { name: /export obsidian/i })
    fireEvent.click(obsidianBtn)

    await waitFor(() => {
      expect(screen.getByText('Obsidian vault exported')).toBeInTheDocument()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/items/export/obsidian', expect.any(Object))
  })

  it('supports generating and copying bookmarklet key', async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/settings/bookmarklet-key' && init?.method === 'POST') {
        return { key: 'new-generated-key-999' }
      }
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    // Click "Copy bookmarklet link"
    const copyBtn = screen.getByRole('button', { name: /copy bookmarklet link/i })
    fireEvent.click(copyBtn)
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
    expect(screen.getByText('Copied!')).toBeInTheDocument()

    // Click "Regenerate key"
    const regenBtn = screen.getByRole('button', { name: /regenerate key/i })
    fireEvent.click(regenBtn)

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/settings/bookmarklet-key', { method: 'POST' })
    })
  })

  it('supports auto-lock timeout update and strict local mode toggle', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    // Auto lock timeout change
    const timeoutSelect = screen.getAllByRole('combobox')[1] // The second select in settings
    fireEvent.change(timeoutSelect, { target: { value: '60' } })

    expect(mockApiFetch).toHaveBeenCalledWith('/settings', {
      method: 'PUT',
      body: JSON.stringify({ auto_lock_timeout: '60' }),
    })

    // Strict local mode toggle
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(mockApiFetch).toHaveBeenCalledWith('/settings', {
      method: 'PUT',
      body: JSON.stringify({ strict_local_mode: 'true' }),
    })
  })

  it('runs AI enrichment manually', async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/items/enrich' && init?.method === 'POST') {
        return { queued: 5 }
      }
      if (url === '/items/enrichment') return { pending: 3, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-run enrichment/i })).toBeInTheDocument()
    })

    const enrichBtn = screen.getByRole('button', { name: /re-run enrichment/i })
    fireEvent.click(enrichBtn)

    await waitFor(() => {
      expect(screen.getByText(/Re-queued 5 notes for AI classification/i)).toBeInTheDocument()
    })
  })

  it('reprocesses unreviewed items in bulk', async () => {
    mockReprocessBulk.mockResolvedValue({ queued: 4 })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-process/i })).toBeInTheDocument()
    })

    const reprocessBtn = screen.getByRole('button', { name: /re-process/i })
    fireEvent.click(reprocessBtn)

    await waitFor(() => {
      expect(screen.getByText(/Re-processing 4 items with the current model/i)).toBeInTheDocument()
    })
    expect(mockReprocessBulk).toHaveBeenCalledWith('unreviewed')
  })

  it('can open Vault Reset Confirmation modal, verify password and submit reset', async () => {
    // Mock the crypto deriveKey and decrypt calls
    const dummyKey = { type: 'key' }
    mockBase64ToUint8Array.mockReturnValue(new Uint8Array([1, 2, 3]))
    mockDeriveKey.mockResolvedValue(dummyKey)
    mockDecryptVaultItem.mockResolvedValue('memex-vault-v1')

    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/vault/status') {
        return { hasSetup: true, salt: 'c2FsdA==', verifier: 'verifier', verifierIv: 'iv' }
      }
      if (url === '/vault/reset' && init?.method === 'POST') {
        expect(JSON.parse(init.body)).toEqual({ verifiedSentinel: 'memex-vault-v1' })
        return { success: true }
      }
      if (url === '/items/enrichment') return { pending: 0, total: 10 }
      if (url === '/ingest/markitdown/health') return { installed: true }
      if (url === '/settings') return mockSettings
      return {}
    })

    render(<SettingsPage />)

    // Open modal
    const resetBtn = screen.getByRole('button', { name: /reset vault/i })
    fireEvent.click(resetBtn)

    expect(screen.getByText('Reset Vault?')).toBeInTheDocument()

    // Enter password
    const pwdInput = screen.getByPlaceholderText('Vault password')
    fireEvent.change(pwdInput, { target: { value: 'password123' } })

    // Click "Delete Everything"
    const deleteBtn = screen.getByRole('button', { name: /delete everything/i })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/vault/reset', {
        method: 'POST',
        body: JSON.stringify({ verifiedSentinel: 'memex-vault-v1' }),
      })
      expect(screen.getByText(/Vault reset — all secrets deleted and password cleared/i)).toBeInTheDocument()
    })
  })
})
