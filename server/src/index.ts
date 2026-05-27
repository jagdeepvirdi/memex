import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
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
const JWT_SECRET = process.env.JWT_SECRET || 'memex-default-secret'

// ── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet()) // Security headers
app.use(cors())   // Enable CORS for all routes (standard for local-first apps)
app.use(express.json())

// ── Auth Middleware ──────────────────────────────────────────────────────────

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Public paths
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/health')) {
    return next()
  }
  
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
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

// ── Start ─────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Memex server listening on http://localhost:${PORT}`)
    
    // Start background workers
    startEmbeddingWorker()
  })
}
