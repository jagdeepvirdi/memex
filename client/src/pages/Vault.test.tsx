import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLock = vi.fn()
const mockUnlock = vi.fn()
const mockUpdateActivity = vi.fn()
const mockCheckAutoLock = vi.fn()

let mockIsLocked = true
let mockVaultKey: any = null

vi.mock('../store/vaultStore', () => ({
  useVaultStore: () => ({
    isLocked: mockIsLocked,
    lock: mockLock,
    unlock: mockUnlock,
    vaultKey: mockVaultKey,
    updateActivity: mockUpdateActivity,
    checkAutoLock: mockCheckAutoLock,
  }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('../components/AppHeader', () => ({
  AppHeader: Object.assign(
    ({ left, actions }: any) => (
      <header data-testid="app-header">
        {left}
        {actions}
      </header>
    ),
    { Spacer: () => <div /> }
  ),
}))

vi.mock('../components/vault/VaultLocked', () => ({
  default: () => <div data-testid="vault-locked">Locked Screen</div>,
}))

vi.mock('../components/vault/VaultItemForm', () => ({
  default: ({ onCancel }: any) => (
    <div data-testid="vault-item-form">
      <button onClick={onCancel}>Cancel Form</button>
    </div>
  ),
}))

vi.mock('../components/cards/VaultCard', () => ({
  default: ({ item }: any) => <div data-testid={`vault-card-${item.id}`}>{item.service}</div>,
}))

vi.mock('../components/vault/VaultChangePassword', () => ({
  VaultChangePassword: ({ onCancel }: any) => (
    <div data-testid="change-password">
      <button onClick={onCancel}>Cancel PW Change</button>
    </div>
  ),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockApiFetch = vi.fn()
const mockMigrateToVault = vi.fn()
vi.mock('../lib/api', () => ({
  apiFetch: (...a: any[]) => mockApiFetch(...a),
  migrateToVault: (...a: any[]) => mockMigrateToVault(...a),
}))

vi.mock('../lib/crypto', () => ({
  encryptVaultItem: vi.fn().mockResolvedValue({ ciphertext: 'enc', iv: 'iv' }),
}))

import VaultPage from './Vault'

const makeVaultItem = (id: string, service: string) => ({
  id,
  service,
  username: 'testuser',
  url: 'https://example.com',
  type: 'credential' as const,
  ciphertext: 'enc',
  iv: 'iv',
  createdAt: new Date(),
  updatedAt: new Date(),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockIsLocked = true
  mockVaultKey = null
  mockApiFetch.mockResolvedValue([])
})

// ── Locked state ──────────────────────────────────────────────────────────────

describe('VaultPage — locked state', () => {
  it('renders the VaultLocked component when locked', () => {
    mockIsLocked = true
    render(<VaultPage />)
    expect(screen.getByTestId('vault-locked')).toBeInTheDocument()
  })

  it('does not render the vault header when locked', () => {
    mockIsLocked = true
    render(<VaultPage />)
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
  })
})

// ── Unlocked state ────────────────────────────────────────────────────────────

describe('VaultPage — unlocked state', () => {
  beforeEach(() => {
    mockIsLocked = false
    mockVaultKey = { type: 'secret' }
  })

  it('renders the Encrypted Vault heading', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByText('Encrypted Vault')).toBeInTheDocument())
  })

  it('renders the app header with vault branding', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByTestId('app-header')).toBeInTheDocument())
  })

  it('renders the Add Secret button', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByText('Add Secret')).toBeInTheDocument())
  })

  it('renders the search input', async () => {
    render(<VaultPage />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Search vault...')).toBeInTheDocument()
    )
  })

  it('calls apiFetch /vault to load vault items', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/vault'))
  })
})

// ── Loading state ─────────────────────────────────────────────────────────────

describe('VaultPage — loading state', () => {
  it('shows decrypting message while loading', async () => {
    mockIsLocked = false
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    render(<VaultPage />)
    await waitFor(() =>
      expect(screen.getByText('Decrypting vault data...')).toBeInTheDocument()
    )
  })
})

// ── Empty state ───────────────────────────────────────────────────────────────

describe('VaultPage — empty vault', () => {
  beforeEach(() => {
    mockIsLocked = false
    mockVaultKey = { type: 'secret' }
    mockApiFetch.mockResolvedValue([])
  })

  it('shows the "Your vault is empty" message', async () => {
    render(<VaultPage />)
    await waitFor(() =>
      expect(screen.getByText('Your vault is empty')).toBeInTheDocument()
    )
  })

  it('shows "Add your first secret" button', async () => {
    render(<VaultPage />)
    await waitFor(() =>
      expect(screen.getByText('Add your first secret')).toBeInTheDocument()
    )
  })
})

// ── With vault items ──────────────────────────────────────────────────────────

describe('VaultPage — with vault items', () => {
  beforeEach(() => {
    mockIsLocked = false
    mockVaultKey = { type: 'secret' }
    mockApiFetch.mockResolvedValue([
      makeVaultItem('v1', 'GitHub'),
      makeVaultItem('v2', 'Gmail'),
    ])
  })

  it('renders vault cards for each item', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByTestId('vault-card-v1')).toBeInTheDocument())
    expect(screen.getByTestId('vault-card-v2')).toBeInTheDocument()
  })

  it('renders GitHub vault card', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByText('GitHub')).toBeInTheDocument())
  })

  it('renders Gmail vault card', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByText('Gmail')).toBeInTheDocument())
  })
})

// ── Search ────────────────────────────────────────────────────────────────────

describe('VaultPage — search', () => {
  beforeEach(() => {
    mockIsLocked = false
    mockVaultKey = { type: 'secret' }
    mockApiFetch.mockResolvedValue([
      makeVaultItem('v1', 'GitHub'),
      makeVaultItem('v2', 'Gmail'),
    ])
  })

  it('filters out items that do not match search query', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByTestId('vault-card-v1')).toBeInTheDocument())
    const input = screen.getByPlaceholderText('Search vault...')
    fireEvent.change(input, { target: { value: 'GitHub' } })
    await waitFor(() => expect(screen.queryByTestId('vault-card-v2')).not.toBeInTheDocument())
    expect(screen.getByTestId('vault-card-v1')).toBeInTheDocument()
  })
})

// ── Form open/close ───────────────────────────────────────────────────────────

describe('VaultPage — add secret form', () => {
  beforeEach(() => {
    mockIsLocked = false
    mockVaultKey = { type: 'secret' }
    mockApiFetch.mockResolvedValue([])
  })

  it('shows the VaultItemForm when Add Secret is clicked', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByText('Add Secret')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add Secret'))
    expect(screen.getByTestId('vault-item-form')).toBeInTheDocument()
  })

  it('hides the VaultItemForm when Cancel is clicked', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByText('Add Secret')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add Secret'))
    expect(screen.getByTestId('vault-item-form')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel Form'))
    expect(screen.queryByTestId('vault-item-form')).not.toBeInTheDocument()
  })
})

describe('VaultPage — lock action', () => {
  beforeEach(() => {
    mockIsLocked = false
    mockVaultKey = { type: 'secret' }
    mockApiFetch.mockResolvedValue([])
  })

  it('calls lock() when Lock Vault button is clicked', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByTitle('Lock Vault')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Lock Vault'))
    expect(mockLock).toHaveBeenCalled()
  })

  it('shows the Change Password button', async () => {
    render(<VaultPage />)
    await waitFor(() => expect(screen.getByTitle('Change Vault Password')).toBeInTheDocument())
  })
})
