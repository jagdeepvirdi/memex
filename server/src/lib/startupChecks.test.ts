import { describe, it, expect, vi } from 'vitest'
import {
  weakSecretReason, checkSecrets, secretsPolicy, runSecretChecks, describeSecretProblems, StartupError,
  maskDatabaseUrl, describeDatabaseError, MIN_SECRET_LENGTH,
} from './startupChecks'

const STRONG = 'a3f9c2e87b1d4056aa91c0d3e5f7b2184c6d9e0f1a2b3c4d5e6f708192a3b4c5'
const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv

describe('weakSecretReason', () => {
  it('accepts a long random secret', () => expect(weakSecretReason(STRONG)).toBeNull())

  it.each([undefined, '', '   '])('rejects a missing secret (%j)', (v) => expect(weakSecretReason(v)).toBe('is not set'))

  it.each([
    'replace-with-a-random-32-char-string', 'memex-default-secret', 'changeme', 'CHANGE-ME', 'Password', 'your-secret-here',
    'please-replace-with-something', 'my-changeme-value-which-is-long-enough-xx',
  ])('rejects the example value %s even when it is long enough', (v) => {
    expect(weakSecretReason(v)).toMatch(/example value/)
  })

  it('rejects a short secret and says how long it is and how long it must be', () => {
    expect(weakSecretReason('abc123xyz')).toBe(`is too short (9 characters; use at least ${MIN_SECRET_LENGTH})`)
  })

  it('accepts exactly the minimum length', () => {
    const exactly = 'k4Lm9Qr2Vx7Zb1Nc6Td3Wf8Hg5Js0PaZ'.slice(0, MIN_SECRET_LENGTH)
    expect(exactly).toHaveLength(MIN_SECRET_LENGTH)
    expect(weakSecretReason(exactly)).toBeNull()
    expect(weakSecretReason(exactly.slice(0, -1))).toMatch(/too short/)
  })

  it.each(['a'.repeat(40), 'ab'.repeat(30), 'abcd'.repeat(12)])('rejects a repetitive secret %s', (v) => {
    expect(weakSecretReason(v)).toMatch(/repetitive/)
  })

  it('ignores surrounding whitespace when judging length', () => {
    expect(weakSecretReason(`  ${'abc'}  `)).toMatch(/too short \(3 characters/)
  })
})

describe('checkSecrets', () => {
  it('has nothing to say about a good JWT_SECRET', () => expect(checkSecrets(env({ JWT_SECRET: STRONG }))).toEqual([]))

  it('requires JWT_SECRET', () => {
    expect(checkSecrets(env({}))).toEqual([{ variable: 'JWT_SECRET', reason: 'is not set' }])
  })

  it('checks KEY_ENCRYPTION_SECRET only when it is set', () => {
    expect(checkSecrets(env({ JWT_SECRET: STRONG }))).toEqual([])
    expect(checkSecrets(env({ JWT_SECRET: STRONG, KEY_ENCRYPTION_SECRET: '' }))).toEqual([])
    const p = checkSecrets(env({ JWT_SECRET: STRONG, KEY_ENCRYPTION_SECRET: 'short' }))
    expect(p).toEqual([{ variable: 'KEY_ENCRYPTION_SECRET', reason: expect.stringMatching(/too short/) }])
  })

  it('reports every problem at once', () => {
    expect(checkSecrets(env({ JWT_SECRET: 'changeme', KEY_ENCRYPTION_SECRET: 'x' })).map(p => p.variable)).toEqual(['JWT_SECRET', 'KEY_ENCRYPTION_SECRET'])
  })
})

describe('secretsPolicy', () => {
  it('enforces in production', () => expect(secretsPolicy(env({ NODE_ENV: 'production' }))).toBe('enforce'))
  it.each(['development', 'test', undefined])('only warns in %s', (n) => expect(secretsPolicy(env({ NODE_ENV: n }))).toBe('warn'))
  it('can be overridden explicitly, and only by 1', () => {
    expect(secretsPolicy(env({ NODE_ENV: 'production', MEMEX_ALLOW_WEAK_SECRETS: '1' }))).toBe('warn')
    expect(secretsPolicy(env({ NODE_ENV: 'production', MEMEX_ALLOW_WEAK_SECRETS: 'true' }))).toBe('enforce')
    expect(secretsPolicy(env({ NODE_ENV: 'production', MEMEX_ALLOW_WEAK_SECRETS: '0' }))).toBe('enforce')
  })
})

describe('runSecretChecks', () => {
  it('is silent with good secrets', () => {
    const warn = vi.fn()
    expect(runSecretChecks(env({ NODE_ENV: 'production', JWT_SECRET: STRONG }), warn)).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('refuses to start in production, naming the variable, the reason and how to fix it', () => {
    const warn = vi.fn()
    let err: unknown
    try { runSecretChecks(env({ NODE_ENV: 'production', JWT_SECRET: 'replace-with-a-random-32-char-string' }), warn) } catch (e) { err = e }
    expect(err).toBeInstanceOf(StartupError)
    const msg = (err as Error).message
    expect(msg).toMatch(/will not start with a weak secret/)
    expect(msg).toMatch(/JWT_SECRET is still an example value/)
    expect(msg).toMatch(/randomBytes\(32\)/)
    expect(msg).toMatch(/\.env/)
    expect(msg).toMatch(/MEMEX_ALLOW_WEAK_SECRETS=1/)
    expect(warn).not.toHaveBeenCalled()
  })

  it('only warns outside production, so a local experiment is not blocked', () => {
    const warn = vi.fn()
    const problems = runSecretChecks(env({ NODE_ENV: 'development', JWT_SECRET: 'short' }), warn)
    expect(problems).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/only a warning outside production/)
  })

  it('never prints the secret itself', () => {
    const warn = vi.fn()
    runSecretChecks(env({ NODE_ENV: 'development', JWT_SECRET: 'mySecretValue123' }), warn)
    expect(warn.mock.calls[0][0]).not.toContain('mySecretValue123')
    expect(describeSecretProblems([{ variable: 'JWT_SECRET', reason: 'is not set' }])).not.toContain('undefined')
  })

  it('production with the escape hatch warns instead of stopping', () => {
    const warn = vi.fn()
    expect(() => runSecretChecks(env({ NODE_ENV: 'production', MEMEX_ALLOW_WEAK_SECRETS: '1', JWT_SECRET: 'x' }), warn)).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})

describe('maskDatabaseUrl', () => {
  it('hides the password and keeps host, port and database', () => {
    expect(maskDatabaseUrl('postgresql://memex:supersecret@localhost:5436/memex')).toBe('postgresql://memex:***@localhost:5436/memex')
  })
  it('copes with no user, a missing value and nonsense', () => {
    expect(maskDatabaseUrl('postgresql://localhost:5432/memex')).toBe('postgresql://localhost:5432/memex')
    expect(maskDatabaseUrl(undefined)).toMatch(/not set/)
    expect(maskDatabaseUrl('not a url')).toMatch(/not a valid URL/)
  })
})

describe('describeDatabaseError', () => {
  const URL = 'postgresql://memex:pw@localhost:5436/memex'

  it('tells the user to start Postgres when it is unreachable, and never shows the password', () => {
    const msg = describeDatabaseError(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5436'), { code: 'ECONNREFUSED' }), URL)
    expect(msg).toMatch(/Cannot reach the database at postgresql:\/\/memex:\*\*\*@localhost:5436\/memex/)
    expect(msg).toMatch(/docker compose up -d postgres/)
    expect(msg).toMatch(/5436/)
    expect(msg).not.toContain(':pw@')
  })

  it.each([
    [{ code: 'ETIMEDOUT', message: 'x' }, /Cannot reach the database/],
    [{ message: 'timeout exceeded when trying to connect' }, /Cannot reach the database/],
    [{ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND db' }, /host .* could not be found/],
    [{ code: '28P01', message: 'password authentication failed for user "memex"' }, /rejected the user name or password/],
    [{ code: '3D000', message: 'database "nope" does not exist' }, /does not exist/],
    [{ code: '57P03', message: 'the database system is starting up' }, /still starting up/],
  ])('explains %j', (err, expected) => {
    expect(describeDatabaseError(err, URL)).toMatch(expected)
  })

  it('can leave out where the database is, for text a stranger may read', () => {
    expect(describeDatabaseError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }), URL, { hideLocation: true })).toMatch(/^Cannot reach the database\./)
    for (const err of [{ code: 'ECONNREFUSED', message: 'x' }, { code: 'ENOTFOUND', message: 'x' }, { code: '28P01', message: 'x' }, { code: '3D000', message: 'x' }, { code: '57P03', message: 'x' }, { message: 'odd' }]) {
      const msg = describeDatabaseError(err, URL, { hideLocation: true })
      expect(msg).not.toMatch(/postgresql:\/\/|memex:\*\*\*|@localhost|pw/) // the user's connection details, not the documented compose port
    }
  })

  it('falls back to the raw message for anything else', () => {
    expect(describeDatabaseError(new Error('weird'), URL)).toMatch(/Cannot use the database at .*: weird/)
    expect(describeDatabaseError('plain string', URL)).toMatch(/plain string/)
  })
})
