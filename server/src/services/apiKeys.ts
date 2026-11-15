// User-supplied API keys (Claude, Gemini, YouTube Data API).
//
// Where a key comes from, in priority order:
//   1. the environment (ANTHROPIC_API_KEY / GEMINI_API_KEY / YOUTUBE_API_KEY) — always wins;
//   2. a key saved from the Settings page, stored ENCRYPTED in `api_keys` (migration 023).
//
// Rules this module enforces:
//   - no endpoint or log line ever contains a key; the UI gets {configured, source, last4} only;
//   - keys are encrypted at rest with AES-256-GCM. The key-encryption key is derived (scrypt) from
//     KEY_ENCRYPTION_SECRET, or JWT_SECRET if that is unset, and the provider name is bound in as
//     additional authenticated data so a row cannot be swapped to another provider;
//   - a stored key that can no longer be decrypted (secret rotated) is reported, never guessed at;
//   - the app keeps working if the table is missing (migration not yet run): env keys still apply.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { pool } from '../db/client.js'
import logger from '../lib/logger.js'

export const KEY_PROVIDERS = ['claude', 'gemini', 'youtube'] as const
export type KeyProvider = (typeof KEY_PROVIDERS)[number]

export const KEY_ENV: Record<KeyProvider, string> = {
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  youtube: 'YOUTUBE_API_KEY',
}

export const KEY_LABEL: Record<KeyProvider, string> = {
  claude: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
  youtube: 'YouTube Data API',
}

export function isKeyProvider(v: unknown): v is KeyProvider {
  return typeof v === 'string' && (KEY_PROVIDERS as readonly string[]).includes(v)
}

export type KeySource = 'env' | 'stored'

export interface KeyStatus {
  provider: KeyProvider
  label: string
  configured: boolean
  /** Which key is in effect. `env` wins over `stored`. */
  source: KeySource | null
  /** Last four characters of the key in effect. */
  last4?: string
  /** A key is also saved in the app (so removing the env var would fall back to it). */
  hasStored: boolean
  /** A saved key exists but cannot be decrypted (the encryption secret changed). */
  undecryptable: boolean
}

// ── Validation ────────────────────────────────────────────────────────────────

const MIN_KEY_LENGTH = 8
const MAX_KEY_LENGTH = 400

export class InvalidApiKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidApiKeyError'
  }
}

/** Trims and checks shape only (formats change, so no per-provider prefix is enforced). */
export function validateKey(raw: unknown): string {
  if (typeof raw !== 'string') throw new InvalidApiKeyError('The key must be text.')
  const key = raw.trim()
  if (key.length < MIN_KEY_LENGTH) throw new InvalidApiKeyError('That key is too short.')
  if (key.length > MAX_KEY_LENGTH) throw new InvalidApiKeyError('That key is too long.')
  if (!/^[\x21-\x7E]+$/.test(key)) throw new InvalidApiKeyError('A key has no spaces or special characters — check you copied only the key.')
  return key
}

// ── Encryption ────────────────────────────────────────────────────────────────

let derived: { secret: string; key: Buffer } | null = null

function encryptionKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('KEY_ENCRYPTION_SECRET or JWT_SECRET must be set to store API keys')
  if (!derived || derived.secret !== secret) {
    derived = { secret, key: scryptSync(secret, 'memex-api-keys-v1', 32) }
  }
  return derived.key
}

export function encryptKey(provider: KeyProvider, plain: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(provider))
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { ciphertext: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'), iv: iv.toString('base64') }
}

/** Returns null when the data was tampered with, belongs to another provider, or the secret changed. */
export function decryptKey(provider: KeyProvider, ciphertext: string, iv: string): string | null {
  try {
    const data = Buffer.from(ciphertext, 'base64')
    if (data.length < 17) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAAD(Buffer.from(provider))
    decipher.setAuthTag(data.subarray(data.length - 16))
    return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ── In-memory view of the stored keys ─────────────────────────────────────────
// AI provider availability is checked synchronously all over ai.ts, so the stored keys are loaded
// once (and reloaded after any change) and read through peekApiKey().

interface Stored {
  key: string | null // null = present but undecryptable
  last4: string
}

let cache: Map<KeyProvider, Stored> | null = null
let loading: Promise<void> | null = null

async function load(): Promise<void> {
  const next = new Map<KeyProvider, Stored>()
  try {
    const { rows } = await pool.query<{ provider: string; ciphertext: string; iv: string; last4: string }>(
      'SELECT provider, ciphertext, iv, last4 FROM api_keys',
    )
    for (const r of rows) {
      if (!isKeyProvider(r.provider)) continue
      const key = decryptKey(r.provider, r.ciphertext, r.iv)
      if (key === null) logger.warn({ provider: r.provider }, 'Stored API key cannot be decrypted (encryption secret changed?)')
      next.set(r.provider, { key, last4: r.last4 })
    }
  } catch (err) {
    // Table missing (migration 023 not run) or DB unavailable: carry on with env keys only.
    logger.warn({ code: (err as { code?: string }).code }, 'Could not load stored API keys')
  }
  cache = next
}

/** Loads the stored keys once. Cheap to call before any code that needs a key. */
export function ensureApiKeysLoaded(): Promise<void> {
  if (cache) return Promise.resolve()
  if (!loading) loading = load().finally(() => { loading = null })
  return loading
}

/** Drops the loaded copy so the next ensureApiKeysLoaded() reads the table again. */
export function resetApiKeyCache(): void {
  cache = null
  loading = null
}

function envKey(provider: KeyProvider): string | undefined {
  const v = process.env[KEY_ENV[provider]]?.trim()
  return v ? v : undefined
}

/** The key in effect, synchronously: env first, then a saved key. Call ensureApiKeysLoaded() first. */
export function peekApiKey(provider: KeyProvider): string | undefined {
  return envKey(provider) ?? cache?.get(provider)?.key ?? undefined
}

export async function getApiKey(provider: KeyProvider): Promise<string | undefined> {
  await ensureApiKeysLoaded()
  return peekApiKey(provider)
}

/** Removes any in-effect key from a string — SDK and HTTP errors can echo a key back. */
export function redactSecrets(text: string): string {
  let out = text
  for (const p of KEY_PROVIDERS) {
    const key = peekApiKey(p)
    if (key) out = out.split(key).join('[redacted]')
  }
  return out
}

// ── Status / writes ───────────────────────────────────────────────────────────

export async function getKeyStatuses(): Promise<KeyStatus[]> {
  await ensureApiKeysLoaded()
  return KEY_PROVIDERS.map(provider => {
    const env = envKey(provider)
    const stored = cache?.get(provider)
    const source: KeySource | null = env ? 'env' : stored?.key ? 'stored' : null
    const last4 = env ? env.slice(-4) : stored?.key ? stored.last4 : undefined
    return {
      provider,
      label: KEY_LABEL[provider],
      configured: source !== null,
      source,
      ...(last4 ? { last4 } : {}),
      hasStored: !!stored,
      undecryptable: !!stored && stored.key === null,
    }
  })
}

export async function getKeyStatus(provider: KeyProvider): Promise<KeyStatus> {
  return (await getKeyStatuses()).find(s => s.provider === provider)!
}

/** Encrypts and saves a key (replacing any earlier one). Throws InvalidApiKeyError for bad input. */
export async function setApiKey(provider: KeyProvider, raw: unknown): Promise<void> {
  const key = validateKey(raw)
  const { ciphertext, iv } = encryptKey(provider, key)
  await pool.query(
    `INSERT INTO api_keys (provider, ciphertext, iv, last4, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (provider) DO UPDATE
       SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, last4 = EXCLUDED.last4, updated_at = NOW()`,
    [provider, ciphertext, iv, key.slice(-4)],
  )
  resetApiKeyCache()
  await ensureApiKeysLoaded()
}

export async function deleteApiKey(provider: KeyProvider): Promise<void> {
  await pool.query('DELETE FROM api_keys WHERE provider = $1', [provider])
  resetApiKeyCache()
  await ensureApiKeysLoaded()
}
