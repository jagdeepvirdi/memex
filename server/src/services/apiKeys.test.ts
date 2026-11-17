import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A tiny fake `api_keys` table behind pool.query so set/delete/load run for real.
let table: Array<{ provider: string; ciphertext: string; iv: string; last4: string }> = []
let failWith: { code: string } | null = null
const queries: Array<{ sql: string; params: unknown[] }> = []

vi.mock('../db/client', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (failWith) throw Object.assign(new Error('db error'), failWith)
      if (/^\s*SELECT .* FROM api_keys/.test(sql)) return { rows: table.map(r => ({ ...r })) }
      if (/INSERT INTO api_keys/.test(sql)) {
        const [provider, ciphertext, iv, last4] = params as string[]
        table = [...table.filter(r => r.provider !== provider), { provider, ciphertext, iv, last4 }]
        return { rows: [], rowCount: 1 }
      }
      if (/DELETE FROM api_keys/.test(sql)) {
        table = table.filter(r => r.provider !== params[0])
        return { rows: [], rowCount: 1 }
      }
      return { rows: [] }
    }),
  },
}))
vi.mock('../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import {
  validateKey, InvalidApiKeyError, encryptKey, decryptKey, peekApiKey, getApiKey, ensureApiKeysLoaded,
  resetApiKeyCache, getKeyStatuses, getKeyStatus, setApiKey, deleteApiKey, redactSecrets, KEY_ENV,
} from './apiKeys'

const SAVE = { ...process.env }
const CLAUDE_KEY = 'sk-ant-api03-ABCDEFGHIJKLMNOP-wxyz'

beforeEach(() => {
  table = []
  failWith = null
  queries.length = 0
  resetApiKeyCache()
  for (const v of Object.values(KEY_ENV)) delete process.env[v]
  delete process.env.KEY_ENCRYPTION_SECRET
  process.env.JWT_SECRET = 'a-test-jwt-secret-of-reasonable-length'
})
afterEach(() => { process.env = { ...SAVE } })

describe('validateKey', () => {
  it('trims and accepts a normal key', () => {
    expect(validateKey(`  ${CLAUDE_KEY}\n`)).toBe(CLAUDE_KEY)
  })
  it.each([
    ['not a string', 123],
    ['empty', '   '],
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(401)],
    ['contains a space', 'sk-ant key with spaces'],
    ['contains a newline', 'sk-ant-abc\ndef-ghi'],
    ['non-ascii', 'sk-ant-ключ-secret-key'],
  ])('rejects %s', (_n, v) => {
    expect(() => validateKey(v)).toThrow(InvalidApiKeyError)
  })
  it('does not echo the rejected value in the message', () => {
    try { validateKey('has a space inside it') } catch (e) { expect((e as Error).message).not.toContain('space inside') }
  })
})

describe('encryption', () => {
  it('round-trips, with a fresh IV each time and no plaintext in the stored form', () => {
    const a = encryptKey('claude', CLAUDE_KEY)
    const b = encryptKey('claude', CLAUDE_KEY)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.ciphertext).not.toContain(CLAUDE_KEY)
    expect(Buffer.from(a.ciphertext, 'base64').toString('utf8')).not.toContain('sk-ant')
    expect(decryptKey('claude', a.ciphertext, a.iv)).toBe(CLAUDE_KEY)
  })

  it('refuses tampered data', () => {
    const e = encryptKey('claude', CLAUDE_KEY)
    const bytes = Buffer.from(e.ciphertext, 'base64')
    bytes[0] ^= 0xff
    expect(decryptKey('claude', bytes.toString('base64'), e.iv)).toBeNull()
  })

  it('binds the ciphertext to its provider, so a row cannot be moved to another provider', () => {
    const e = encryptKey('claude', CLAUDE_KEY)
    expect(decryptKey('gemini', e.ciphertext, e.iv)).toBeNull()
  })

  it('cannot be read after the encryption secret changes', () => {
    const e = encryptKey('gemini', 'AIzaSyExampleExampleExample1234')
    process.env.JWT_SECRET = 'a-different-secret-entirely-now'
    expect(decryptKey('gemini', e.ciphertext, e.iv)).toBeNull()
  })

  it('prefers KEY_ENCRYPTION_SECRET over JWT_SECRET', () => {
    process.env.KEY_ENCRYPTION_SECRET = 'dedicated-key-encryption-secret-123'
    const e = encryptKey('claude', CLAUDE_KEY)
    delete process.env.KEY_ENCRYPTION_SECRET // falls back to JWT_SECRET → different key
    expect(decryptKey('claude', e.ciphertext, e.iv)).toBeNull()
    process.env.KEY_ENCRYPTION_SECRET = 'dedicated-key-encryption-secret-123'
    expect(decryptKey('claude', e.ciphertext, e.iv)).toBe(CLAUDE_KEY)
  })

  it('returns null for garbage input instead of throwing', () => {
    expect(decryptKey('claude', 'not base64!!', 'also not')).toBeNull()
    expect(decryptKey('claude', '', '')).toBeNull()
  })
})

describe('precedence and loading', () => {
  it('uses the environment key when set, even if one is saved', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key-value-1234'
    await setApiKey('claude', CLAUDE_KEY)
    expect(await getApiKey('claude')).toBe('env-key-value-1234')
  })

  it('uses a saved key when the environment has none, and ignores a blank env value', async () => {
    process.env.ANTHROPIC_API_KEY = '   '
    await setApiKey('claude', CLAUDE_KEY)
    expect(await getApiKey('claude')).toBe(CLAUDE_KEY)
    expect(peekApiKey('claude')).toBe(CLAUDE_KEY)
  })

  it('is undefined when nothing is configured', async () => {
    expect(await getApiKey('youtube')).toBeUndefined()
  })

  it('loads the table once, and again after a reset', async () => {
    await ensureApiKeysLoaded()
    await ensureApiKeysLoaded()
    await getApiKey('claude')
    expect(queries.filter(q => /SELECT/.test(q.sql))).toHaveLength(1)
    resetApiKeyCache()
    await ensureApiKeysLoaded()
    expect(queries.filter(q => /SELECT/.test(q.sql))).toHaveLength(2)
  })

  it('still works with env keys when the table is missing (migration not run)', async () => {
    failWith = { code: '42P01' }
    process.env.GEMINI_API_KEY = 'env-gemini-key-9999'
    await expect(ensureApiKeysLoaded()).resolves.toBeUndefined()
    expect(peekApiKey('gemini')).toBe('env-gemini-key-9999')
    expect(peekApiKey('claude')).toBeUndefined()
  })

  it('does not use a stored key it cannot decrypt, and reports it', async () => {
    const e = encryptKey('claude', CLAUDE_KEY)
    table = [{ provider: 'claude', ciphertext: e.ciphertext, iv: e.iv, last4: CLAUDE_KEY.slice(-4) }]
    process.env.JWT_SECRET = 'rotated-secret-after-saving-the-key'
    resetApiKeyCache()
    expect(await getApiKey('claude')).toBeUndefined()
    const s = await getKeyStatus('claude')
    expect(s).toMatchObject({ configured: false, source: null, hasStored: true, undecryptable: true })
  })

  it('ignores rows for unknown providers', async () => {
    table = [{ provider: 'openai', ciphertext: 'x', iv: 'y', last4: 'zzzz' }]
    await expect(ensureApiKeysLoaded()).resolves.toBeUndefined()
  })
})

describe('setApiKey / deleteApiKey', () => {
  it('stores only ciphertext, the last four characters, and no plaintext anywhere in the query', async () => {
    await setApiKey('claude', `  ${CLAUDE_KEY} `)
    const insert = queries.find(q => /INSERT INTO api_keys/.test(q.sql))!
    expect(JSON.stringify(insert.params)).not.toContain(CLAUDE_KEY)
    expect(insert.params[3]).toBe('wxyz')
    expect(insert.sql).not.toContain(CLAUDE_KEY)
    expect(table[0].last4).toBe('wxyz')
  })

  it('makes the key available immediately', async () => {
    expect(peekApiKey('gemini')).toBeUndefined()
    await setApiKey('gemini', 'AIzaSyExampleExampleExample1234')
    expect(peekApiKey('gemini')).toBe('AIzaSyExampleExampleExample1234')
  })

  it('replaces an earlier key rather than adding a second row', async () => {
    await setApiKey('youtube', 'AIzaSyFirstFirstFirstFirst0001')
    await setApiKey('youtube', 'AIzaSySecondSecondSecond00002')
    expect(table).toHaveLength(1)
    expect(peekApiKey('youtube')).toBe('AIzaSySecondSecondSecond00002')
  })

  it('rejects invalid input without touching the database', async () => {
    await expect(setApiKey('claude', 'short')).rejects.toBeInstanceOf(InvalidApiKeyError)
    expect(queries).toHaveLength(0)
  })

  it('removes a saved key, leaving an environment key alone', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key-value-1234'
    await setApiKey('claude', CLAUDE_KEY)
    await deleteApiKey('claude')
    expect(table).toHaveLength(0)
    expect(peekApiKey('claude')).toBe('env-key-value-1234')
  })

  it('propagates a database error (e.g. missing table) so the route can explain it', async () => {
    failWith = { code: '42P01' }
    await expect(setApiKey('claude', CLAUDE_KEY)).rejects.toMatchObject({ code: '42P01' })
  })
})

describe('getKeyStatuses', () => {
  it('reports every provider, unconfigured by default', async () => {
    const s = await getKeyStatuses()
    expect(s.map(x => x.provider)).toEqual(['claude', 'gemini', 'openai', 'groq', 'youtube'])
    expect(s.every(x => !x.configured && x.source === null && !x.hasStored && !x.undecryptable)).toBe(true)
    expect(s.map(x => x.label)).toEqual(['Anthropic (Claude)', 'Google Gemini', 'OpenAI (ChatGPT)', 'Groq', 'YouTube Data API'])
  })

  it('shows source and last four for a saved key', async () => {
    await setApiKey('claude', CLAUDE_KEY)
    expect(await getKeyStatus('claude')).toMatchObject({ configured: true, source: 'stored', last4: 'wxyz', hasStored: true })
  })

  it('shows the environment key as the one in effect when both exist', async () => {
    process.env.YOUTUBE_API_KEY = 'AIzaEnvEnvEnvEnvEnvEnvEnvEnv7777'
    await setApiKey('youtube', 'AIzaSavedSavedSavedSavedSaved1111')
    expect(await getKeyStatus('youtube')).toMatchObject({ source: 'env', last4: '7777', hasStored: true })
  })

  it('never contains more than the last four characters of any key', async () => {
    process.env.GEMINI_API_KEY = 'AIzaEnvGeminiSECRETSECRETSECRET5555'
    await setApiKey('claude', CLAUDE_KEY)
    const json = JSON.stringify(await getKeyStatuses())
    expect(json).not.toContain('SECRETSECRET')
    expect(json).not.toContain('ABCDEFGHIJKLMNOP')
    expect(json).not.toContain('sk-ant')
    expect(json).toContain('5555')
    expect(json).toContain('wxyz')
  })
})

describe('redactSecrets', () => {
  it('removes env and saved keys from any text', async () => {
    process.env.GEMINI_API_KEY = 'AIzaEnvKeyEnvKeyEnvKey0000'
    await setApiKey('claude', CLAUDE_KEY)
    const out = redactSecrets(`401 for ${CLAUDE_KEY} and also AIzaEnvKeyEnvKeyEnvKey0000 twice ${CLAUDE_KEY}`)
    expect(out).not.toContain(CLAUDE_KEY)
    expect(out).not.toContain('AIzaEnvKey')
    expect(out.match(/\[redacted\]/g)).toHaveLength(3)
  })

  it('leaves text without keys unchanged', () => {
    expect(redactSecrets('nothing secret here')).toBe('nothing secret here')
  })
})
