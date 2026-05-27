import { describe, it, expect } from 'vitest';
import { deriveKey, encryptVaultItem, decryptVaultItem, uint8ArrayToBase64, base64ToUint8Array } from './crypto';

describe('Vault Crypto', () => {
  const password = 'test-password-123';
  const salt = new Uint8Array(32).fill(1); // mock salt

  it('should derive a key from a password', async () => {
    const key = await deriveKey(password, salt);
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
  });

  it('should encrypt and decrypt a string successfully', async () => {
    const key = await deriveKey(password, salt);
    const plaintext = 'Secret Message';

    const { ciphertext, iv } = await encryptVaultItem(plaintext, key);
    expect(ciphertext).not.toBe(plaintext);
    expect(iv).toBeDefined();

    const decrypted = await decryptVaultItem(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should fail to decrypt with wrong key', async () => {
    const key1 = await deriveKey(password, salt);
    const key2 = await deriveKey('wrong-password', salt);
    const plaintext = 'Secret Message';

    const { ciphertext, iv } = await encryptVaultItem(plaintext, key1);

    await expect(decryptVaultItem(ciphertext, iv, key2)).rejects.toThrow();
  });

  it('should convert between base64 and Uint8Array', () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = uint8ArrayToBase64(arr);
    expect(b64).toBe('SGVsbG8=');
    
    const back = base64ToUint8Array(b64);
    expect(back).toEqual(arr);
  });
});
