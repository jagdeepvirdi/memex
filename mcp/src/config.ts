// Settings come from the environment, because that is how an MCP host (Claude Desktop, Cursor, ...) passes them to
// a server it launches: MEMEX_URL (where Memex runs) and MEMEX_MCP_KEY (created in Memex > Settings > Capture).

export interface Config {
  /** Base address of Memex, without a trailing slash. */
  baseUrl: string
  /** The scoped MCP key. Sent as a bearer token, never logged. */
  key: string
  /** Set when the address is not this computer and not https: the key would cross the network in clear text. */
  warning?: string
}

export class ConfigError extends Error {}

export const DEFAULT_URL = 'http://localhost:3002'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const key = (env.MEMEX_MCP_KEY ?? '').trim()
  if (!key) {
    throw new ConfigError(
      'MEMEX_MCP_KEY is not set. Create a key in Memex under Settings > Capture > AI assistants, then put it in this server\'s "env" in your assistant\'s config.',
    )
  }

  const raw = (env.MEMEX_URL ?? DEFAULT_URL).trim()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`MEMEX_URL is not a valid address: "${raw}". Example: ${DEFAULT_URL}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`MEMEX_URL must start with http:// or https:// (got "${url.protocol}").`)
  }

  const baseUrl = `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  const warning =
    url.protocol === 'http:' && !LOOPBACK.has(url.hostname)
      ? `MEMEX_URL (${url.origin}) is not this computer and not https, so the key and your notes travel unencrypted. Use https or a local address.`
      : undefined
  return { baseUrl, key, warning }
}
