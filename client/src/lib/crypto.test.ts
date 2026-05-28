import { describe, it, expect } from 'vitest';
import { deriveKey, encryptVaultItem, decryptVaultItem, uint8ArrayToBase64, base64ToUint8Array } from './crypto';

const PASSWORD = 'test-password-123';
const SALT     = new Uint8Array(32).fill(1);

// ── deriveKey ─────────────────────────────────────────────────────────────────

describe('deriveKey', () => {
  it('derives a secret CryptoKey from password + salt', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
  });

  it('same password + same salt always produces an equivalent key', async () => {
    const key1 = await deriveKey(PASSWORD, SALT);
    const key2 = await deriveKey(PASSWORD, SALT);
    // Both should successfully decrypt data encrypted by the other
    const { ciphertext, iv } = await encryptVaultItem('hello', key1);
    const decrypted = await decryptVaultItem(ciphertext, iv, key2);
    expect(decrypted).toBe('hello');
  });

  it('different salts produce different keys (same password fails to cross-decrypt)', async () => {
    const salt2 = new Uint8Array(32).fill(2);
    const key1  = await deriveKey(PASSWORD, SALT);
    const key2  = await deriveKey(PASSWORD, salt2);
    const { ciphertext, iv } = await encryptVaultItem('secret', key1);
    await expect(decryptVaultItem(ciphertext, iv, key2)).rejects.toThrow();
  });
});

// ── encrypt / decrypt ─────────────────────────────────────────────────────────

describe('encryptVaultItem + decryptVaultItem', () => {
  it('round-trips a plaintext string', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    const { ciphertext, iv } = await encryptVaultItem('My secret password', key);
    const decrypted = await decryptVaultItem(ciphertext, iv, key);
    expect(decrypted).toBe('My secret password');
  });

  it('ciphertext is different from plaintext', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    const { ciphertext } = await encryptVaultItem('plaintext', key);
    expect(ciphertext).not.toBe('plaintext');
  });

  it('two encryptions of the same string produce different ciphertexts (random IV)', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    const enc1 = await encryptVaultItem('same text', key);
    const enc2 = await encryptVaultItem('same text', key);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it('decryption with wrong key throws', async () => {
    const key1 = await deriveKey(PASSWORD, SALT);
    const key2 = await deriveKey('wrong-password', SALT);
    const { ciphertext, iv } = await encryptVaultItem('secret', key1);
    await expect(decryptVaultItem(ciphertext, iv, key2)).rejects.toThrow();
  });

  it('decryption with corrupted ciphertext throws', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    const { iv } = await encryptVaultItem('data', key);
    const garbage = btoa('this is not valid encrypted data at all 12345678');
    await expect(decryptVaultItem(garbage, iv, key)).rejects.toThrow();
  });

  it('encrypts and decrypts an empty string', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    const { ciphertext, iv } = await encryptVaultItem('', key);
    const decrypted = await decryptVaultItem(ciphertext, iv, key);
    expect(decrypted).toBe('');
  });

  it('encrypts and decrypts unicode / non-ASCII characters', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    const unicode = '日本語テスト 🔐 café résumé naïve';
    const { ciphertext, iv } = await encryptVaultItem(unicode, key);
    const decrypted = await decryptVaultItem(ciphertext, iv, key);
    expect(decrypted).toBe(unicode);
  });

  it('encrypts and decrypts a long string (>1KB)', async () => {
    const key = await deriveKey(PASSWORD, SALT);
    const long = 'x'.repeat(2048);
    const { ciphertext, iv } = await encryptVaultItem(long, key);
    const decrypted = await decryptVaultItem(ciphertext, iv, key);
    expect(decrypted).toBe(long);
  });
});

// ── base64 helpers ────────────────────────────────────────────────────────────

describe('uint8ArrayToBase64 / base64ToUint8Array', () => {
  it('roundtrips a Uint8Array through base64', () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(base64ToUint8Array(uint8ArrayToBase64(arr))).toEqual(arr);
  });

  it('encodes "Hello" as SGVsbG8=', () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ArrayToBase64(arr)).toBe('SGVsbG8=');
  });

  it('handles an empty array', () => {
    const arr = new Uint8Array(0);
    const b64 = uint8ArrayToBase64(arr);
    expect(base64ToUint8Array(b64)).toEqual(arr);
  });

  it('handles a single byte', () => {
    const arr = new Uint8Array([255]);
    expect(base64ToUint8Array(uint8ArrayToBase64(arr))).toEqual(arr);
  });
});
