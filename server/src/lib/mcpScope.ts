// What the MCP key is allowed to do.
//
// The MCP key is given to an AI assistant (Claude Desktop, Cursor, ...) that runs the Memex MCP server on this
// machine. It is a scoped credential, like the bookmarklet key, but wider: the assistant can search, read and
// save, so it gets exactly the routes of the `/api/mcp` router and nothing else. Settings (including this key and
// the API keys), exports, the vault, categories, deletes and every other route need a real login session.
//
// The key is only ever shown once, when it is created. The database keeps its SHA-256 hash, so a leaked backup or a
// settings dump does not hand out a working key.

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

/** Method + path pairs the MCP key may call. Keep in step with routes/mcp.ts (a test checks every route is listed). */
export const MCP_ROUTES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'GET', path: /^\/api\/mcp\/search$/ },
  { method: 'GET', path: /^\/api\/mcp\/recent$/ },
  { method: 'GET', path: /^\/api\/mcp\/items\/[^/]+$/ },
  { method: 'POST', path: /^\/api\/mcp\/notes$/ },
  { method: 'POST', path: /^\/api\/mcp\/links$/ },
]

/** A key shorter than this is never accepted (the generated one is 'mxk_' + 48 hex characters). */
export const MIN_MCP_KEY_LENGTH = 32
export const MCP_KEY_PREFIX = 'mxk_'

/** Query string and trailing slashes ignored; Express routes case-insensitively, so compare that way too. */
function normalizePath(path: string): string {
  return path.split('?')[0].replace(/\/+$/, '').toLowerCase()
}

export function isMcpRoute(method: string, path: string): boolean {
  const m = method.toUpperCase()
  const p = normalizePath(path)
  return MCP_ROUTES.some(r => r.method === m && r.path.test(p))
}

export function generateMcpKey(): string {
  return MCP_KEY_PREFIX + randomBytes(24).toString('hex')
}

export function hashMcpKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** True when `token` is the key whose SHA-256 hash is `storedHash` (the settings value as `pg` returns it). */
export function matchesMcpKey(token: string, storedHash: unknown): boolean {
  if (typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false
  if (token.length < MIN_MCP_KEY_LENGTH) return false
  const a = Buffer.from(hashMcpKey(token), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
