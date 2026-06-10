import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockDeriveKey = vi.fn()
const mockBase64ToUint8Array = vi.fn()
const mockEncryptVaultItem = vi.fn()
const mockDecryptVaultItem = vi.fn()

vi.mock('../../lib/crypto', () => ({
  deriveKey: (password: string, salt: Uint8Array) => mockDeriveKey(password, salt),
  base64ToUint8Array: (base64: string) => mockBase64ToUint8Array(base64),
  encryptVaultItem: (text: string, key: any) => mockEncryptVaultItem(text, key),
  decryptVaultItem: (cipher: string, iv: string, key: any) => mockDecryptVaultItem(cipher, iv, key),
}))

const mockUnlock = vi.fn()
vi.mock('../../store/vaultStore', () => ({
  useVaultStore: (selector: (s: any) => any) => selector({
    unlock: mockUnlock,
  }),
}))

const mockApiFetch = vi.fn()
vi.mock('../../lib/api', () => ({
  apiFetch: (url: string, init?: any) => mockApiFetch(url, init),
}))

import VaultLocked from './VaultLocked'

describe('VaultLocked Component', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockDeriveKey.mockReset()
    mockBase64ToUint8Array.mockReset()
    mockEncryptVaultItem.mockReset()
    mockDecryptVaultItem.mockReset()
    mockUnlock.mockReset()
    mockNavigate.mockReset()

    mockApiFetch.mockResolvedValue({ hasSetup: false })
  })

  it('renders loading state initially', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})) // hangs in loading
    render(<VaultLocked />)

    // Spinner should be visible
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('redirects to setup screen if vault status hasSetup is false', async () => {
    mockApiFetch.mockResolvedValue({ hasSetup: false })
    render(<VaultLocked />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Set Vault Password' })).toBeInTheDocument()
    })
    expect(screen.getByText('New Vault')).toBeInTheDocument()
  })

  it('validates password length and match during setup', async () => {
    mockApiFetch.mockResolvedValue({ hasSetup: false })
    render(<VaultLocked />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Set Vault Password' })).toBeInTheDocument()
    })

    const passwordInput = screen.getByPlaceholderText('New vault password')
    const confirmInput = screen.getByPlaceholderText('Confirm vault password')
    const submitBtn = screen.getByRole('button', { name: /set vault password/i })

    // 1. Password too short
    fireEvent.change(passwordInput, { target: { value: 'short' } })
    fireEvent.change(confirmInput, { target: { value: 'short' } })
    fireEvent.click(submitBtn)
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()

    // 2. Passwords mismatch
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'different123' } })
    fireEvent.click(submitBtn)
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('completes setup successfully when credentials are valid', async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/vault/status') return { hasSetup: false }
      if (url === '/vault/salt') return { salt: 'c2FsdA==' } // base64 'salt'
      if (url === '/vault/setup' && init?.method === 'POST') {
        expect(JSON.parse(init.body)).toEqual({ verifier: 'encrypted-sentinel', verifierIv: 'iv-value' })
        return { success: true }
      }
      return {}
    })

    const mockKey = { type: 'key' }
    mockBase64ToUint8Array.mockReturnValue(new Uint8Array([1, 2, 3]))
    mockDeriveKey.mockResolvedValue(mockKey)
    mockEncryptVaultItem.mockResolvedValue({ ciphertext: 'encrypted-sentinel', iv: 'iv-value' })

    render(<VaultLocked />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Set Vault Password' })).toBeInTheDocument()
    })

    const passwordInput = screen.getByPlaceholderText('New vault password')
    const confirmInput = screen.getByPlaceholderText('Confirm vault password')
    const submitBtn = screen.getByRole('button', { name: /set vault password/i })

    fireEvent.change(passwordInput, { target: { value: 'validPassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'validPassword123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockDeriveKey).toHaveBeenCalledWith('validPassword123', expect.any(Uint8Array))
      expect(mockEncryptVaultItem).toHaveBeenCalledWith('memex-vault-v1', mockKey)
      expect(mockUnlock).toHaveBeenCalledWith(mockKey)
    })
  })

  it('renders unlock screen if vault is already setup, and unlocks with correct password', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/vault/status') {
        return { hasSetup: true, salt: 'c2FsdA==', verifier: 'encrypted-sentinel', verifierIv: 'iv-value' }
      }
      return {}
    })

    const mockKey = { type: 'key' }
    mockBase64ToUint8Array.mockReturnValue(new Uint8Array([1, 2, 3]))
    mockDeriveKey.mockResolvedValue(mockKey)
    mockDecryptVaultItem.mockResolvedValue('memex-vault-v1') // matching sentinel

    render(<VaultLocked />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Unlock Vault' })).toBeInTheDocument()
    })

    const passwordInput = screen.getByPlaceholderText('Vault password')
    const submitBtn = screen.getByRole('button', { name: /unlock/i })

    fireEvent.change(passwordInput, { target: { value: 'unlockPassword123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockDeriveKey).toHaveBeenCalledWith('unlockPassword123', expect.any(Uint8Array))
      expect(mockDecryptVaultItem).toHaveBeenCalledWith('encrypted-sentinel', 'iv-value', mockKey)
      expect(mockUnlock).toHaveBeenCalledWith(mockKey)
    })
  })

  it('shows error if wrong password is entered during unlock', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/vault/status') {
        return { hasSetup: true, salt: 'c2FsdA==', verifier: 'encrypted-sentinel', verifierIv: 'iv-value' }
      }
      return {}
    })

    const mockKey = { type: 'key' }
    mockBase64ToUint8Array.mockReturnValue(new Uint8Array([1, 2, 3]))
    mockDeriveKey.mockResolvedValue(mockKey)
    mockDecryptVaultItem.mockRejectedValue(new Error('Decryption failed')) // incorrect password

    render(<VaultLocked />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Unlock Vault' })).toBeInTheDocument()
    })

    const passwordInput = screen.getByPlaceholderText('Vault password')
    const submitBtn = screen.getByRole('button', { name: /unlock/i })

    fireEvent.change(passwordInput, { target: { value: 'wrongPassword123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Wrong vault password')).toBeInTheDocument()
      expect(mockUnlock).not.toHaveBeenCalled()
    })
  })

  it('allows clicking Back button to navigate home', async () => {
    mockApiFetch.mockResolvedValue({ hasSetup: false })
    render(<VaultLocked />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('toggles password visibility when eye icon is clicked', async () => {
    mockApiFetch.mockResolvedValue({ hasSetup: false })
    render(<VaultLocked />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('New vault password')).toBeInTheDocument()
    })

    const passwordInput = screen.getByPlaceholderText('New vault password')
    expect(passwordInput).toHaveAttribute('type', 'password')

    // Click show password
    // Eye/EyeOff Lucide icons are in a button, since it has tabIndex={-1} and no name, we find it by query
    const toggleBtn = screen.getAllByRole('button').find(b => !b.textContent && b.querySelector('svg'))!
    fireEvent.click(toggleBtn)
 
    expect(passwordInput).toHaveAttribute('type', 'text')
 
    // Click hide password
    fireEvent.click(toggleBtn)
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
