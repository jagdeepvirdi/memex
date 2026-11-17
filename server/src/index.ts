import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import jwt from 'jsonwebtoken'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { pool } from './db/client.js'
import type { Request, Response, NextFunction } from 'express'

// Load .env from project root regardless of CWD
const __dirname = dirname(fileURLToPath(import.meta.url))
// Source layout: server/src -> ../../.env. Compiled layout: server/dist/server/src -> ../../../../.env.
const envCandidates = [resolve(__dirname, '../../.env'), resolve(__dirname, '../../../../.env')]
const envPath = envCandidates.find((p) => existsSync(p)) ?? envCandidates[0]
config({ path: envPath })

import itemsRouter from './routes/items.js'
import categoriesRouter from './routes/categories.js'
import tagsRouter from './routes/tags.js'
import ingestRouter from './routes/ingest.js'
import vaultRouter from './routes/vault.js'
import searchRouter from './routes/search.js'
import authRouter from './routes/auth.js'
import settingsRouter from './routes/settings.js'
import aiRouter from './routes/ai.js'
import shareRouter from './routes/share.js'
import { itemCategoriesHandler } from './routes/categories.js'
import { itemTagsHandler } from './routes/tags.js'
import { checkOllamaHealth } from './services/ollama.js'
import { startEmbeddingWorker } from './services/embeddingWorker.js'
import { loadEmbeddingConfig } from './services/embeddingConfig.js'
import logger from './lib/logger.js'
import { refreshedSessionToken, REFRESH_HEADER } from './lib/session.js'
import { isBookmarkletRoute, matchesBookmarkletKey } from './lib/bookmarkletScope.js'
import { prepareStartup } from './lib/startup.js'
import { StartupError } from './lib/startupChecks.js'
import { clientDistDir, mountClient, shouldServeClient } from './lib/serveClient.js'
import healthRouter from './routes/health.js'

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

// Security headers. The web app is served from this origin in production, so the default policy is kept except: images may
// come from any https site (saved links show thumbnails), and `upgrade-insecure-requests` is dropped because Memex is
// normally reached over plain http://localhost, where it would break every asset.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:'],
      'upgrade-insecure-requests': null,
    },
  },
}))
// CORS is intentionally open: Memex is a local-first, single-user tool that runs
// on the user's own machine (localhost). If you ever deploy it to a shared server,
// restrict this to specific origins, e.g. cors({ origin: 'https://your-host' }).
app.use(cors({ exposedHeaders: [REFRESH_HEADER] }))
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
  let payload: string | jwt.JwtPayload | null = null
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {}
  if (payload) {
    req.user = payload
    // Sliding session: hand back a fresh token once the current one is a day
    // old, so an actively used session doesn't expire on a fixed clock.
    const fresh = refreshedSessionToken(payload, JWT_SECRET)
    if (fresh) res.setHeader(REFRESH_HEADER, fresh)
    return next()
  }

  // 2. Try the bookmarklet key (persistent, never expires). It is a deliberately weak credential —
  // it sits in a browser bookmark — so it may only make the one request the bookmarklet makes.
  try {
    const { rows } = await pool.query(
      "SELECT value FROM settings WHERE key = 'bookmarklet_key'",
    )
    if (rows.length > 0 && matchesBookmarkletKey(token, rows[0].value)) {
      if (!isBookmarkletRoute(req.method, req.path)) {
        return res.status(403).json({ error: 'This key can only be used to save pages from the bookmarklet.' })
      }
      req.user = 'bookmarklet'
      return next()
    }
  } catch {}

  res.status(401).json({ error: 'Invalid token' })
}

// In production (the Docker image) this process also serves the built web app. It is public: only the API behind the
// auth middleware needs a session. Mounted before the middleware, and it never answers /api paths.
if (shouldServeClient()) {
  const dir = clientDistDir()
  if (dir) mountClient(app, dir)
  else logger.warn('MEMEX_SERVE_CLIENT / production is on but the web app is not built (client/dist/index.html is missing)')
}

app.use(authMiddleware)

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'memex-server', timestamp: new Date().toISOString() })
})

app.use('/api/health', healthRouter)

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
app.use('/api/ai', aiRouter)
app.use('/api/share', shareRouter)

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  try {
    // Weak secrets, an unreachable database and a failed migration stop the server here with a readable message,
    // instead of starting and then failing on every request.
    await prepareStartup(process.env, pool, { info: (m) => logger.info(m), warn: (m) => logger.warn(m) })
  } catch (err) {
    if (err instanceof StartupError) {
      console.error(`
Memex could not start.

${err.message}
`)
    } else {
      logger.error(err, 'Startup failed')
    }
    process.exit(1)
  }

  app.listen(PORT, () => {
    logger.info(`Memex server listening on http://localhost:${PORT}`)

    // Start background workers. The active embedding model must be known before the worker embeds anything.
    loadEmbeddingConfig()
      .catch((err) => logger.error(err, 'Could not read the embedding settings, using local Ollama'))
      .finally(() => startEmbeddingWorker())
  })
}

if (process.env.NODE_ENV !== 'test') void start()
