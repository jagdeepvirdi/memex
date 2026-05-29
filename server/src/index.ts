import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { pool } from './db/client.js'
import type { Request, Response, NextFunction } from 'express'

// Load .env from project root regardless of CWD
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env')
config({ path: envPath })

import itemsRouter from './routes/items.js'
import categoriesRouter from './routes/categories.js'
import tagsRouter from './routes/tags.js'
import ingestRouter from './routes/ingest.js'
import vaultRouter from './routes/vault.js'
import searchRouter from './routes/search.js'
import authRouter from './routes/auth.js'
import settingsRouter from './routes/settings.js'
import shareRouter from './routes/share.js'
import { itemCategoriesHandler } from './routes/categories.js'
import { itemTagsHandler } from './routes/tags.js'
import { checkOllamaHealth } from './services/ollama.js'
import { startEmbeddingWorker } from './services/embeddingWorker.js'

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: string | jwt.JwtPayload
    }
  }
}

export const app = express()
const PORT = process.env.PORT ?? 3002
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable must be set — see .env.example')

// ── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet()) // Security headers
app.use(cors())   // Enable CORS for all routes (standard for local-first apps)
app.use(express.json({ limit: '50mb' }))

// ── Auth Middleware ──────────────────────────────────────────────────────────

const PUBLIC_PATHS = [
  '/api/auth',
  '/api/health',
  '/api/ingest/markitdown/health',
  '/api/ingest/vision/health',
  '/api/ingest/whisper/health',
  '/api/share/',
]

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) return next()

  const token = req.headers.authorization?.replace(/^Bearer\s+/, '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  // 1. Try JWT (standard session token)
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    return next()
  } catch {}

  // 2. Try bookmarklet key (persistent, never expires)
  try {
    const { rows } = await pool.query(
      "SELECT value FROM settings WHERE key = 'bookmarklet_key'",
    )
    if (rows.length > 0 && rows[0].value === JSON.stringify(token)) {
      req.user = 'bookmarklet'
      return next()
    }
  } catch {}

  res.status(401).json({ error: 'Invalid token' })
}

app.use(authMiddleware)

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'memex-server', timestamp: new Date().toISOString() })
})

app.get('/api/health/ollama', async (_req: Request, res: Response) => {
  const isHealthy = await checkOllamaHealth()
  res.json({ status: isHealthy ? 'ok' : 'error', service: 'ollama' })
})

// ── Routes ────────────────────────────────────────────────────────────────────

// Register /api/items/:itemId/categories and /api/items/:itemId/tags
itemCategoriesHandler(itemsRouter)
itemTagsHandler(itemsRouter)

app.use('/api/items', itemsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/ingest', ingestRouter)
app.use('/api/vault', vaultRouter)
app.use('/api/search', searchRouter)
app.use('/api/auth', authRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/share', shareRouter)

// ── Start ─────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Memex server listening on http://localhost:${PORT}`)
    
    // Start background workers
    startEmbeddingWorker()
  })
}
