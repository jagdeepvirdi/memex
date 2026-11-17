import type { CorsOptions, CorsOptionsDelegate } from 'cors'
import type { Request } from 'express'
import { isBookmarkletRoute } from './bookmarkletScope.js'

// Who may call the API from a web page.
//   - The web app is same-origin in production and uses the Vite proxy in development, so neither needs CORS at all.
//   - The bookmarklet runs on ANY site and posts to one route, so that single route (and its preflight) is open to every
//     origin. Its key is accepted for that route only (see bookmarkletScope.ts).
//   - Every other route answers cross-origin only to localhost / 127.0.0.1 (any port: a dev server or another local tool)
//     and to origins listed in MEMEX_CORS_ORIGINS (comma separated, e.g. "https://memex.example.com").
// A request with no Origin header (curl, the server itself, mobile share targets) is not a browser cross-origin call and is
// unaffected. Blocked origins get no CORS headers, so the browser refuses to hand the response to the page.

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i

/** "a, b ,,c" -> ["a","b","c"] with trailing slashes removed; anything that is not an http(s) origin is dropped. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https?:\/\/[^/\s]+$/i.test(s))
}

export function isOriginAllowed(origin: string, allowed: string[]): boolean {
  return LOCAL_ORIGIN.test(origin) || allowed.some((a) => a.toLowerCase() === origin.toLowerCase())
}

export function corsDelegate(allowed: string[], exposedHeaders: string[]): CorsOptionsDelegate<Request> {
  return (req, cb) => {
    const base: CorsOptions = { exposedHeaders }
    const path = req.originalUrl ?? req.url ?? ''
    // A preflight asks about the method it announces; the preflight itself is an OPTIONS request.
    const method = req.method.toUpperCase() === 'OPTIONS'
      ? String(req.headers['access-control-request-method'] ?? '')
      : req.method
    if (isBookmarkletRoute(method, path)) return cb(null, { ...base, origin: true })
    cb(null, { ...base, origin: (origin, done) => done(null, !origin || isOriginAllowed(origin, allowed)) })
  }
}
