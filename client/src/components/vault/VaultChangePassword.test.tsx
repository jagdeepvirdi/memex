import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { VaultItem } from '../../../../shared/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDeriveKey = vi.fn()
const mockEncryptVaultItem = vi.fn()
const mockDecryptVaultItem = vi.fn()
const mockUint8ArrayToBase64 = vi.fn()

vi.mock('../../lib/crypto', () => ({
  deriveKey: (password: string, salt: Uint8Array) => mockDeriveKey(password, salt),
  encryptVaultItem: (text: string, key: any) => mockEncryptVaultItem(text, key),
  decryptVaultItem: (cipher: string, iv: string, key: any) => mockDecryptVaultItem(cipher, iv, key),
  uint8ArrayToBase64: (bytes: Uint8Array) => mockUint8ArrayToBase64(bytes),
}))

const mockApiFetch = vi.fn()
vi.mock('../../lib/api', () => ({
  apiFetch: (url: string, init?: any) => mockApiFetch(url, init),
}))

import { VaultChangePassword } from './VaultChangePassword'

describe('VaultChangePassword Component', () => {
  const mockItems: VaultItem[] = [
    { id: '1', service: 'S1', ciphertext: 'c1', iv: 'iv1', type: 'note', createdAt: new Date(), updatedAt: new Date() },
    { id: '2', service: 'S2', ciphertext: 'c2', iv: 'iv2', type: 'credential', createdAt: new Date(), updatedAt: new Date() },
  ]
  const mockOldKey = { type: 'old-key' } as unknown as CryptoKey
  const mockOnSuccess = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    mockDeriveKey.mockReset()
    mockEncryptVaultItem.mockReset()
    mockDecryptVaultItem.mockReset()
    mockUint8ArrayToBase64.mockReset()
    mockApiFetch.mockReset()
    mockOnSuccess.mockReset()
    mockOnCancel.mockReset()

    Object.defineProperty(window, 'crypto', {
      value: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) arr[i] = i
          return arr
        },
      },
      configurable: true,
      writable: true,
    })
  })

  it('renders form and lists total items', () => {
    render(
      <VaultChangePassword
        items={mockItems}
        vaultKey={mockOldKey}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText('Change Vault Password')).toBeInTheDocument()
    expect(screen.getByText(/All 2 secrets will be re-encrypted/i)).toBeInTheDocument()
  })

  it('validates password length and match', () => {
    render(
      <VaultChangePassword
        items={mockItems}
        vaultKey={mockOldKey}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    const passwordInput = screen.getByPlaceholderText('New vault password')
    const confirmInput = screen.getByPlaceholderText('Confirm new vault password')
    const submitBtn = screen.getByRole('button', { name: /change password/i })

    // Too short
    fireEvent.change(passwordInput, { target: { value: 'short' } })
    fireEvent.change(confirmInput, { target: { value: 'short' } })
    fireEvent.click(submitBtn)
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()

    // Passwords mismatch
    fireEvent.change(passwordInput, { target: { value: 'newPassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'wrongPassword123' } })
    fireEvent.click(submitBtn)
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('successfully re-encrypts all items and calls api/onSuccess', async () => {
    const mockNewKey = { type: 'new-key' }
    mockUint8ArrayToBase64.mockReturnValue('new-salt-base64')
    mockDeriveKey.mockResolvedValue(mockNewKey)

    // Decrypt old values
    mockDecryptVaultItem.mockImplementation(async (cipher: string) => {
      if (cipher === 'c1') return 'secret-content-1'
      if (cipher === 'c2') return 'secret-content-2'
      throw new Error('Unexpected decrypt')
    })

    // Encrypt new values
    mockEncryptVaultItem.mockImplementation(async (text: string) => {
      if (text === 'secret-content-1') return { ciphertext: 'new-c1', iv: 'new-iv1' }
      if (text === 'secret-content-2') return { ciphertext: 'new-c2', iv: 'new-iv2' }
      if (text === 'memex-vault-v1') return { ciphertext: 'new-sentinel', iv: 'new-sentinel-iv' }
      throw new Error('Unexpected encrypt')
    })

    mockApiFetch.mockResolvedValue({ success: true })

    render(
      <VaultChangePassword
        items={mockItems}
        vaultKey={mockOldKey}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    const passwordInput = screen.getByPlaceholderText('New vault password')
    const confirmInput = screen.getByPlaceholderText('Confirm new vault password')
    const submitBtn = screen.getByRole('button', { name: /change password/i })

    fireEvent.change(passwordInput, { target: { value: 'superSecurePassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'superSecurePassword123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockDecryptVaultItem).toHaveBeenCalledWith('c1', 'iv1', mockOldKey)
      expect(mockDecryptVaultItem).toHaveBeenCalledWith('c2', 'iv2', mockOldKey)

      expect(mockEncryptVaultItem).toHaveBeenCalledWith('secret-content-1', mockNewKey)
      expect(mockEncryptVaultItem).toHaveBeenCalledWith('secret-content-2', mockNewKey)
      expect(mockEncryptVaultItem).toHaveBeenCalledWith('memex-vault-v1', mockNewKey)

      expect(mockApiFetch).toHaveBeenCalledWith('/vault/rekey', {
        method: 'PUT',
        body: JSON.stringify({
          salt: 'new-salt-base64',
          verifier: 'new-sentinel',
          verifierIv: 'new-sentinel-iv',
          items: [
            { id: '1', ciphertext: 'new-c1', iv: 'new-iv1' },
            { id: '2', ciphertext: 'new-c2', iv: 'new-iv2' },
          ],
        }),
      })

      expect(mockOnSuccess).toHaveBeenCalledWith(mockNewKey)
    })
  })

  it('displays error if rekey API call fails', async () => {
    const mockNewKey = { type: 'new-key' }
    mockDeriveKey.mockResolvedValue(mockNewKey)
    mockDecryptVaultItem.mockResolvedValue('plain')
    mockEncryptVaultItem.mockResolvedValue({ ciphertext: 'cipher', iv: 'iv' })
    mockApiFetch.mockRejectedValue(new Error('Rekey API failed'))

    render(
      <VaultChangePassword
        items={mockItems}
        vaultKey={mockOldKey}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    const passwordInput = screen.getByPlaceholderText('New vault password')
    const confirmInput = screen.getByPlaceholderText('Confirm new vault password')
    const submitBtn = screen.getByRole('button', { name: /change password/i })

    fireEvent.change(passwordInput, { target: { value: 'superSecurePassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'superSecurePassword123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Failed to change vault password. Please try again.')).toBeInTheDocument()
      expect(mockOnSuccess).not.toHaveBeenCalled()
    })
  })

  it('triggers onCancel when Cancel button is clicked', () => {
    render(
      <VaultChangePassword
        items={mockItems}
        vaultKey={mockOldKey}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockOnCancel).toHaveBeenCalled()
  })
})
