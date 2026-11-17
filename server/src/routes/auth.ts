import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/client.js'
import logger from '../lib/logger.js'
import { signSessionToken } from '../lib/session.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable must be set')

// Throttle credential endpoints to slow brute-force attempts.
// Limit per IP per window; configurable via env for testing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
})

/**
 * POST /api/auth/login
 */
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    )
    const user = rows[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = signSessionToken({ id: user.id, email: user.email }, JWT_SECRET)
    res.json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    logger.error(err, 'Login error')
    res.status(500).json({ error: 'Login failed' })
  }
})

/**
 * POST /api/auth/setup
 * Only works if no users exist. Creates the first user.
 */
/**
 * GET /api/auth/status
 * Public. Whether this is a fresh install (no account yet), so the first screen can offer setup instead of a login that
 * cannot succeed. Reveals nothing but a boolean.
 */
router.get('/status', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) FROM users')
    res.json({ needsSetup: parseInt(rows[0].count, 10) === 0 })
  } catch (err) {
    logger.error(err, 'Auth status error')
    res.status(500).json({ error: 'Could not check the installation' })
  }
})

/** Shortest password accepted when the account is created (existing accounts are not affected). */
export const MIN_PASSWORD_LENGTH = 10
/** bcrypt only reads the first 72 bytes, so a longer password would be silently cut: refuse it instead. */
export const MAX_PASSWORD_BYTES = 72
const BCRYPT_COST = 12

/** A sentence for the first problem with a new account's email/password, or null. */
export function describeAccountProblem(email: unknown, password: unknown): string | null {
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return 'Email and password are required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return 'Enter a valid email address'
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters`
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return `Use a password of at most ${MAX_PASSWORD_BYTES} bytes (long or non-Latin passwords count more than one byte per character)`
  return null
}

router.post('/setup', authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {}

  const problem = describeAccountProblem(email, password)
  if (problem) {
    return res.status(400).json({ error: problem })
  }

  try {
    const { rows: count } = await pool.query('SELECT COUNT(*) FROM users')
    if (parseInt(count[0].count, 10) > 0) {
      return res.status(403).json({ error: 'Setup already complete' })
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST)
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    )

    const user = rows[0]
    const token = signSessionToken({ id: user.id, email: user.email }, JWT_SECRET)
    res.status(201).json({ token, user })
  } catch (err) {
    logger.error(err, 'Setup error')
    res.status(500).json({ error: 'Setup failed' })
  }
})

/**
 * GET /api/auth/me
 * Verify token and return user info
 */
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, email: string }
    res.json({ user: { id: decoded.userId, email: decoded.email } })
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
