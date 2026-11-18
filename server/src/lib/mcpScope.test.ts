import { describe, it, expect } from 'vitest'
import { isMcpRoute, matchesMcpKey, generateMcpKey, hashMcpKey, MCP_ROUTES, MIN_MCP_KEY_LENGTH, MCP_KEY_PREFIX } from './mcpScope'

describe('generateMcpKey / hashMcpKey', () => {
  it('makes a long prefixed random key and a 64-char hex hash that is not the key', () => {
    const k = generateMcpKey()
    expect(k.startsWith(MCP_KEY_PREFIX)).toBe(true)
    expect(k.length).toBeGreaterThanOrEqual(MIN_MCP_KEY_LENGTH)
    expect(generateMcpKey()).not.toBe(k)
    const h = hashMcpKey(k)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(k)
  })
})

describe('matchesMcpKey', () => {
  const key = generateMcpKey()
  const hash = hashMcpKey(key)

  it('accepts the key whose hash is stored', () => {
    expect(matchesMcpKey(key, hash)).toBe(true)
  })
  it('rejects a different key, a short token, and a missing or malformed stored value', () => {
    expect(matchesMcpKey(generateMcpKey(), hash)).toBe(false)
    expect(matchesMcpKey('short', hash)).toBe(false)
    expect(matchesMcpKey(key, undefined)).toBe(false)
    expect(matchesMcpKey(key, null)).toBe(false)
    expect(matchesMcpKey(key, '')).toBe(false)
    expect(matchesMcpKey(key, 'not-a-hash')).toBe(false)
    // A stored plain key (the bookmarklet style) is not a valid stored value here.
    expect(matchesMcpKey(key, key)).toBe(false)
  })
  it('does not accept the hash itself as the token', () => {
    expect(matchesMcpKey(hash, hash)).toBe(false)
  })
})

describe('isMcpRoute', () => {
  it('allows exactly the assistant routes', () => {
    expect(isMcpRoute('GET', '/api/mcp/search')).toBe(true)
    expect(isMcpRoute('GET', '/api/mcp/recent')).toBe(true)
    expect(isMcpRoute('GET', '/api/mcp/items/3f2b8c1e-0000-4000-8000-000000000001')).toBe(true)
    expect(isMcpRoute('POST', '/api/mcp/notes')).toBe(true)
    expect(isMcpRoute('POST', '/api/mcp/links')).toBe(true)
  })
  it('ignores the query string, trailing slash and case', () => {
    expect(isMcpRoute('get', '/api/mcp/search?q=x')).toBe(true)
    expect(isMcpRoute('GET', '/api/mcp/search/')).toBe(true)
    expect(isMcpRoute('GET', '/API/MCP/Search')).toBe(true)
  })
  it('refuses other methods on the same paths', () => {
    expect(isMcpRoute('POST', '/api/mcp/search')).toBe(false)
    expect(isMcpRoute('DELETE', '/api/mcp/items/abc')).toBe(false)
    expect(isMcpRoute('PUT', '/api/mcp/notes')).toBe(false)
    expect(isMcpRoute('GET', '/api/mcp/notes')).toBe(false)
  })
  it.each([
    '/api/items', '/api/items/export/obsidian', '/api/settings', '/api/settings/mcp-key', '/api/settings/bookmarklet-key',
    '/api/vault', '/api/ai/keys', '/api/search', '/api/ingest/text', '/api/ingest/quicksave', '/api/categories',
    '/api/mcp', '/api/mcp/', '/api/mcp/unknown', '/api/mcp/items', '/api/mcp/items/a/b', '/api/mcp/search/extra',
    '/api/mcp/items/../settings', '/x/api/mcp/search',
  ])('refuses %s', path => {
    for (const m of ['GET', 'POST', 'PUT', 'DELETE']) expect(isMcpRoute(m, path)).toBe(false)
  })
  it('lists only GET and POST', () => {
    expect(new Set(MCP_ROUTES.map(r => r.method))).toEqual(new Set(['GET', 'POST']))
  })
})
