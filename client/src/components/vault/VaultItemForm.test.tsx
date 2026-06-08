import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { VaultItem } from '../../../../shared/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockEncryptVaultItem = vi.fn()
vi.mock('../../lib/crypto', () => ({
  encryptVaultItem: (text: string, key: any) => mockEncryptVaultItem(text, key),
}))

const mockVaultKey = { type: 'vault-key' }
vi.mock('../../store/vaultStore', () => ({
  useVaultStore: (selector: (s: any) => any) => selector({
    vaultKey: mockVaultKey,
  }),
}))

const mockApiFetch = vi.fn()
vi.mock('../../lib/api', () => ({
  apiFetch: (url: string, init?: any) => mockApiFetch(url, init),
}))

import VaultItemForm from './VaultItemForm'

describe('VaultItemForm Component', () => {
  const mockOnSuccess = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockEncryptVaultItem.mockReset()
    mockApiFetch.mockReset()
    mockOnSuccess.mockReset()
    mockOnCancel.mockReset()
  })

  it('renders add new secret form fields', () => {
    render(<VaultItemForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    expect(screen.getByRole('heading', { name: 'Add New Secret' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. GitHub, Netflix')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
  })

  it('renders edit secret form fields with initial values', () => {
    const existingItem: VaultItem = {
      id: 'v123',
      service: 'Twitter',
      url: 'https://twitter.com',
      username: 'tweeter',
      ciphertext: 'old-cipher',
      iv: 'old-iv',
      type: 'credential',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    render(<VaultItemForm item={existingItem} onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    expect(screen.getByRole('heading', { name: 'Edit Secret' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Twitter')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://twitter.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('tweeter')).toBeInTheDocument()
  })

  it('submits a new secret successfully after encrypting password', async () => {
    mockEncryptVaultItem.mockResolvedValue({ ciphertext: 'new-cipher', iv: 'new-iv' })
    mockApiFetch.mockResolvedValue({ id: 'new-item-id', service: 'GitHub' })

    render(<VaultItemForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const serviceInput = screen.getByPlaceholderText('e.g. GitHub, Netflix')
    const usernameInput = screen.getByPlaceholderText('Username')
    const passwordInput = screen.getByPlaceholderText('••••••••')
    const submitBtn = screen.getByRole('button', { name: /save encrypted/i })

    fireEvent.change(serviceInput, { target: { value: 'GitHub' } })
    fireEvent.change(usernameInput, { target: { value: 'github-user' } })
    fireEvent.change(passwordInput, { target: { value: 'gitpass123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockEncryptVaultItem).toHaveBeenCalledWith('gitpass123', mockVaultKey)
      expect(mockApiFetch).toHaveBeenCalledWith('/vault', {
        method: 'POST',
        body: JSON.stringify({
          service: 'GitHub',
          url: '',
          username: 'github-user',
          ciphertext: 'new-cipher',
          iv: 'new-iv',
        }),
      })
      expect(mockOnSuccess).toHaveBeenCalledWith({ id: 'new-item-id', service: 'GitHub' })
    })
  })

  it('updates an existing secret without modifying password', async () => {
    const existingItem: VaultItem = {
      id: 'v123',
      service: 'Twitter',
      url: 'https://twitter.com',
      username: 'tweeter',
      ciphertext: 'old-cipher',
      iv: 'old-iv',
      type: 'credential',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockApiFetch.mockResolvedValue({ id: 'v123', service: 'Twitter Updated' })

    render(<VaultItemForm item={existingItem} onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const serviceInput = screen.getByDisplayValue('Twitter')
    const submitBtn = screen.getByRole('button', { name: /update secret/i })

    fireEvent.change(serviceInput, { target: { value: 'Twitter Updated' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockEncryptVaultItem).not.toHaveBeenCalled()
      expect(mockApiFetch).toHaveBeenCalledWith('/vault/v123', {
        method: 'PUT',
        body: JSON.stringify({
          service: 'Twitter Updated',
          url: 'https://twitter.com',
          username: 'tweeter',
          ciphertext: 'old-cipher',
          iv: 'old-iv',
        }),
      })
      expect(mockOnSuccess).toHaveBeenCalledWith({ id: 'v123', service: 'Twitter Updated' })
    })
  })

  it('updates an existing secret with a new password', async () => {
    const existingItem: VaultItem = {
      id: 'v123',
      service: 'Twitter',
      url: 'https://twitter.com',
      username: 'tweeter',
      ciphertext: 'old-cipher',
      iv: 'old-iv',
      type: 'credential',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockEncryptVaultItem.mockResolvedValue({ ciphertext: 'newly-encrypted-pwd', iv: 'newly-encrypted-iv' })
    mockApiFetch.mockResolvedValue({ id: 'v123', service: 'Twitter' })

    render(<VaultItemForm item={existingItem} onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const passwordInput = screen.getByPlaceholderText('••••••••')
    const submitBtn = screen.getByRole('button', { name: /update secret/i })

    fireEvent.change(passwordInput, { target: { value: 'twitterNewPwd123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockEncryptVaultItem).toHaveBeenCalledWith('twitterNewPwd123', mockVaultKey)
      expect(mockApiFetch).toHaveBeenCalledWith('/vault/v123', {
        method: 'PUT',
        body: JSON.stringify({
          service: 'Twitter',
          url: 'https://twitter.com',
          username: 'tweeter',
          ciphertext: 'newly-encrypted-pwd',
          iv: 'newly-encrypted-iv',
        }),
      })
      expect(mockOnSuccess).toHaveBeenCalledWith({ id: 'v123', service: 'Twitter' })
    })
  })

  it('displays API fetch error message on submit failure', async () => {
    mockEncryptVaultItem.mockResolvedValue({ ciphertext: 'cipher', iv: 'iv' })
    mockApiFetch.mockRejectedValue(new Error('Failed to create secret item'))

    render(<VaultItemForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const serviceInput = screen.getByPlaceholderText('e.g. GitHub, Netflix')
    const passwordInput = screen.getByPlaceholderText('••••••••')
    const submitBtn = screen.getByRole('button', { name: /save encrypted/i })

    fireEvent.change(serviceInput, { target: { value: 'Netflix' } })
    fireEvent.change(passwordInput, { target: { value: 'netpass' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Failed to create secret item')).toBeInTheDocument()
      expect(mockOnSuccess).not.toHaveBeenCalled()
    })
  })

  it('triggers onCancel when Cancel button is clicked', () => {
    render(<VaultItemForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelBtn)

    expect(mockOnCancel).toHaveBeenCalled()
  })
})
