// What the bookmarklet key is allowed to do.
//
// The bookmarklet is a snippet that lives inside a browser bookmark and runs on arbitrary web pages, so
// its key is the weakest credential in the app: it can leak through a synced bookmark, a screen share, or
// a page that reads it. It therefore gets exactly the one request the bookmarklet makes — saving the
// current page — and nothing else. Reading items, exports, vault routes, settings (including this key and
// the API keys) and every other write need a real login session.

import { createHash, timingSafeEqual } from 'crypto'

/** Exact method + path pairs the bookmarklet key may call. Keep this list as short as the bookmarklet script. */
export const BOOKMARKLET_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'POST', path: '/api/ingest/quicksave' },
]

/** A key shorter than this is never accepted (the generated one is 48 hex characters). */
export const MIN_BOOKMARKLET_KEY_LENGTH = 32

/** Query string and trailing slashes ignored; Express routes case-insensitively, so compare that way too. */
function normalizePath(path: string): string {
  return path.split('?')[0].replace(/\/+$/, '').toLowerCase()
}

export function isBookmarkletRoute(method: string, path: string): boolean {
  const m = method.toUpperCase()
  const p = normalizePath(path)
  return BOOKMARKLET_ROUTES.some(r => r.method === m && r.path === p)
}

/** Constant-time comparison (digests first, so length differences do not leak either). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest()
  const db = createHash('sha256').update(b).digest()
  return timingSafeEqual(da, db) && a.length === b.length
}

/**
 * True when `token` is the stored bookmarklet key. `stored` is the settings value as `pg` returns it: JSONB
 * strings arrive already parsed, so it is the bare key (an earlier version compared against a JSON-quoted
 * string, which could never match — the bookmarklet never authenticated).
 */
export function matchesBookmarkletKey(token: string, stored: unknown): boolean {
  if (typeof stored !== 'string') return false
  if (stored.length < MIN_BOOKMARKLET_KEY_LENGTH || token.length < MIN_BOOKMARKLET_KEY_LENGTH) return false
  return safeEqual(token, stored)
}
