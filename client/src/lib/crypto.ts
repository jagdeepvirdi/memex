// AES-256-GCM vault encryption — implemented in Phase 5
// Key never leaves the browser; derived via PBKDF2 (100k iterations, SHA-256)

export type VaultKey = CryptoKey

/**
 * Derives an AES-256-GCM key from a master password and salt using PBKDF2.
 */
export async function deriveKey(masterPassword: string, salt: Uint8Array): Promise<VaultKey> {
  const encoder = new TextEncoder()
  const passwordData = encoder.encode(masterPassword)

  // 1. Import raw password as a key for PBKDF2
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  // 2. Derive the actual AES-GCM key
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts a string using AES-256-GCM.
 * Returns base64 encoded ciphertext and IV.
 */
export async function encryptVaultItem(
  plaintext: string,
  key: VaultKey,
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)
  
  // 12 bytes is standard for AES-GCM IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  }
}

/**
 * Decrypts a base64 encoded ciphertext and IV using AES-256-GCM.
 */
export async function decryptVaultItem(
  ciphertext: string,
  iv: string,
  key: VaultKey,
): Promise<string> {
  const ciphertextData = new Uint8Array(atob(ciphertext).split('').map(c => c.charCodeAt(0)))
  const ivData = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)))

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivData },
    key,
    ciphertextData
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

/**
 * Utility to convert base64 to Uint8Array (useful for salt)
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)))
}

/**
 * Utility to convert Uint8Array to base64
 */
export function uint8ArrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
}
