// Checks run once at startup, so a bad setup fails with a sentence a person can act on, not a stack trace or a server that
// starts and then fails on every request.

/** Thrown for a setup problem the user can fix. `message` is the whole, readable explanation. */
export class StartupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StartupError'
  }
}

export const MIN_SECRET_LENGTH = 32

// Values that appear in docs, examples and tutorials: anyone can guess them, so they protect nothing.
const KNOWN_WEAK = new Set([
  'replace-with-a-random-32-char-string', 'memex-default-secret', 'changeme', 'change-me', 'change_me', 'secret',
  'password', 'your-secret-here', 'your_secret_here', 'jwt-secret', 'jwtsecret', 'test', 'example', 'default',
])

/** Why a secret is not good enough, or null when it is. */
export function weakSecretReason(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return 'is not set'
  const v = value.trim()
  const lower = v.toLowerCase()
  if (KNOWN_WEAK.has(lower) || /replace-with|change-?me|your[-_]?secret/.test(lower)) return 'is still an example value from the docs'
  if (v.length < MIN_SECRET_LENGTH) return `is too short (${v.length} characters; use at least ${MIN_SECRET_LENGTH})`
  if (new Set(v).size <= 4) return 'is too repetitive to be random'
  return null
}

export interface SecretProblem {
  variable: string
  reason: string
}

/** JWT_SECRET is required; KEY_ENCRYPTION_SECRET is checked only when it is set (it defaults to JWT_SECRET). */
export function checkSecrets(env: NodeJS.ProcessEnv = process.env): SecretProblem[] {
  const problems: SecretProblem[] = []
  const jwt = weakSecretReason(env.JWT_SECRET)
  if (jwt) problems.push({ variable: 'JWT_SECRET', reason: jwt })
  if (env.KEY_ENCRYPTION_SECRET !== undefined && env.KEY_ENCRYPTION_SECRET !== '') {
    const key = weakSecretReason(env.KEY_ENCRYPTION_SECRET)
    if (key) problems.push({ variable: 'KEY_ENCRYPTION_SECRET', reason: key })
  }
  return problems
}

/**
 * Production refuses weak secrets (anyone who can guess JWT_SECRET can sign themselves in; the same secret protects your
 * saved API keys). Development only warns, so a local experiment is not blocked. MEMEX_ALLOW_WEAK_SECRETS=1 is the explicit,
 * visible escape hatch.
 */
export function secretsPolicy(env: NodeJS.ProcessEnv = process.env): 'enforce' | 'warn' {
  return env.NODE_ENV === 'production' && env.MEMEX_ALLOW_WEAK_SECRETS !== '1' ? 'enforce' : 'warn'
}

export const SECRET_HOWTO = `Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

export function describeSecretProblems(problems: SecretProblem[]): string {
  return [
    ...problems.map((p) => `  - ${p.variable} ${p.reason}`),
    `  ${SECRET_HOWTO}`,
    '  then put it in your .env file (project root).',
  ].join('\n')
}

/** Throws a StartupError in production; otherwise reports through `warn`. Returns the problems found. */
export function runSecretChecks(env: NodeJS.ProcessEnv, warn: (msg: string) => void): SecretProblem[] {
  const problems = checkSecrets(env)
  if (problems.length === 0) return problems
  const detail = describeSecretProblems(problems)
  if (secretsPolicy(env) === 'enforce') {
    throw new StartupError(`Memex will not start with a weak secret:\n${detail}\n  (To start anyway, which is not recommended, set MEMEX_ALLOW_WEAK_SECRETS=1.)`)
  }
  warn(`Weak secret in your configuration (this is only a warning outside production):\n${detail}`)
  return problems
}

/** The database URL with its password hidden, safe to print. */
export function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return '(DATABASE_URL is not set)'
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.username ? `${u.username}:***@` : ''}${u.host}${u.pathname}`
  } catch {
    return '(DATABASE_URL is not a valid URL)'
  }
}

/**
 * Turns a database connection failure into what the user should do about it. `hideLocation` leaves out where the database
 * is (user, host, port): use it for anything a stranger could read, such as the public health endpoint.
 */
export function describeDatabaseError(err: unknown, url: string | undefined, opts: { hideLocation?: boolean } = {}): string {
  const e = err as { code?: string; message?: string } | undefined
  const where = opts.hideLocation ? '' : maskDatabaseUrl(url)
  const at = where ? ` at ${where}` : ''
  const inUrl = where ? ` (${where})` : ''
  const code = e?.code ?? ''
  const msg = e?.message ?? String(err)
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(msg) || code === 'ETIMEDOUT' || /timeout/i.test(msg)) {
    return `Cannot reach the database${at}.\n  Is Postgres running? Start it with:  docker compose up -d postgres\n  Check that DATABASE_URL in .env uses the right host and port (docker-compose.yml publishes Postgres on host port 5436).`
  }
  if (code === 'ENOTFOUND' || /ENOTFOUND/.test(msg)) {
    return `The database host in DATABASE_URL${inUrl} could not be found.\n  Check the host name in .env.`
  }
  if (code === '28P01' || /password authentication failed/i.test(msg)) {
    return `Postgres rejected the user name or password in DATABASE_URL${inUrl}.\n  Check them against the POSTGRES_USER / POSTGRES_PASSWORD in docker-compose.yml.`
  }
  if (code === '3D000' || /database .* does not exist/i.test(msg)) {
    return `The database in DATABASE_URL${inUrl} does not exist.\n  Create it, or point DATABASE_URL at the "memex" database that docker compose creates.`
  }
  if (code === '57P03' || /starting up/i.test(msg)) {
    return `Postgres${at} is still starting up.\n  Wait a few seconds and start Memex again.`
  }
  return `Cannot use the database${at}: ${msg}`
}
