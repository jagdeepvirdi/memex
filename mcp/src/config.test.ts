import { describe, it, expect } from 'vitest'
import { readConfig, ConfigError, DEFAULT_URL } from './config.js'

const KEY = 'mxk_' + 'a'.repeat(48)

describe('readConfig', () => {
  it('needs a key and says where to get one', () => {
    expect(() => readConfig({})).toThrow(ConfigError)
    expect(() => readConfig({ MEMEX_MCP_KEY: '   ' })).toThrow(/Settings > Capture/)
  })

  it('defaults to the local Memex address', () => {
    expect(readConfig({ MEMEX_MCP_KEY: KEY })).toEqual({ baseUrl: DEFAULT_URL, key: KEY, warning: undefined })
  })

  it('trims the key and removes a trailing slash from the address', () => {
    const c = readConfig({ MEMEX_MCP_KEY: `  ${KEY}\n`, MEMEX_URL: 'http://127.0.0.1:3002///' })
    expect(c.key).toBe(KEY)
    expect(c.baseUrl).toBe('http://127.0.0.1:3002')
  })

  it('keeps a path prefix (Memex behind a reverse proxy)', () => {
    expect(readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'https://example.com/memex/' }).baseUrl).toBe('https://example.com/memex')
  })

  it('rejects an address that is not http(s)', () => {
    expect(() => readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'not a url' })).toThrow(/not a valid address/)
    expect(() => readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'ftp://example.com' })).toThrow(/http/)
    expect(() => readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'file:///etc/passwd' })).toThrow(/http/)
  })

  it('warns about plain http to another machine, but not to this one or over https', () => {
    expect(readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'http://192.168.1.20:3002' }).warning).toMatch(/unencrypted/)
    expect(readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'http://localhost:3002' }).warning).toBeUndefined()
    expect(readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'http://[::1]:3002' }).warning).toBeUndefined()
    expect(readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'https://memex.example.com' }).warning).toBeUndefined()
  })

  it('never puts the key in an error message', () => {
    try {
      readConfig({ MEMEX_MCP_KEY: KEY, MEMEX_URL: 'ftp://x' })
    } catch (e) {
      expect(String(e)).not.toContain(KEY)
    }
  })
})
