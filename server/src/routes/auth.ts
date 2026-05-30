import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/client.js'
import logger from '../lib/logger.js'

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

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
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
router.post('/setup', authLimiter, async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const { rows: count } = await pool.query('SELECT COUNT(*) FROM users')
    if (parseInt(count[0].count, 10) > 0) {
      return res.status(403).json({ error: 'Setup already complete' })
    }

    const hash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    )

    const user = rows[0]
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
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
