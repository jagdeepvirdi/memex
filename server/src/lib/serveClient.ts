import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import type { Express, Request, Response, NextFunction } from 'express'

// In production (the Docker image) one process serves both the API and the built web app, so there is a single port and
// no CORS. Hashed build assets are cached for a year; index.html never is (it names the current assets).

const __dirname = dirname(fileURLToPath(import.meta.url))

/** The built web app: MEMEX_CLIENT_DIR, else client/dist next to the server (source or compiled layout). Null if not built. */
export function clientDistDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.MEMEX_CLIENT_DIR,
    resolve(__dirname, '../../../client/dist'), // src/lib -> repo root
    resolve(__dirname, '../../../../../client/dist'), // dist/server/src/lib -> repo root
  ].filter((c): c is string => !!c)
  return candidates.find((c) => existsSync(resolve(c, 'index.html'))) ?? null
}

/** Serve the web app only in production (or when MEMEX_SERVE_CLIENT=1), and only if it has been built. */
export function shouldServeClient(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV === 'production' || env.MEMEX_SERVE_CLIENT === '1') && env.MEMEX_SERVE_CLIENT !== '0'
}

/**
 * Mount static files and the single-page-app fallback. Must be mounted BEFORE the auth middleware (the page and its assets
 * are public; the API behind it is not) and it never answers /api paths, so unknown API routes keep their JSON errors.
 */
export function mountClient(app: Express, dir: string): void {
  app.use(
    express.static(dir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        else res.setHeader('Cache-Control', 'no-cache')
      },
    }),
  )
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/') || req.path === '/api') return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(resolve(dir, 'index.html'))
  })
}
