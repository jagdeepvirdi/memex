/**
 * Reads the `exp` claim (seconds since epoch) from a JWT without verifying it.
 * Only used to compare two tokens' lifetimes; the server is the authority on
 * validity. Returns null for anything that doesn't look like a JWT.
 */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}
