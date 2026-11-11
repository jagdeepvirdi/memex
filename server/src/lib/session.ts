import jwt from 'jsonwebtoken'

/**
 * Session tokens are short-lived JWTs that renew while the app is in use.
 *
 * - A token is valid for SESSION_TTL.
 * - If a request arrives with a token older than REFRESH_AFTER_SECONDS, the
 *   server issues a fresh one in the X-Refreshed-Token response header, so an
 *   actively used session no longer dies on a fixed 7-day clock.
 * - The `authTime` claim records the original sign-in and is carried over on
 *   every refresh. Once MAX_SESSION_SECONDS have passed since then, no more
 *   refreshes are issued and the user signs in again. A stolen token therefore
 *   can't be renewed forever.
 */
export const SESSION_TTL = '7d'
export const REFRESH_HEADER = 'X-Refreshed-Token'
export const REFRESH_AFTER_SECONDS = 24 * 60 * 60
export const MAX_SESSION_SECONDS = 30 * 24 * 60 * 60

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

export function signSessionToken(
  user: { id: string; email: string },
  secret: string,
  authTime: number = nowSeconds(),
): string {
  return jwt.sign({ userId: user.id, email: user.email, authTime }, secret, { expiresIn: SESSION_TTL })
}

/**
 * Returns a replacement token for a verified payload when it is due for
 * renewal, or null when the current token should simply be kept.
 */
export function refreshedSessionToken(
  payload: unknown,
  secret: string,
  now: number = nowSeconds(),
): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { userId, email, iat, authTime } = payload as Record<string, unknown>
  if (typeof userId !== 'string' || typeof email !== 'string' || typeof iat !== 'number') return null

  if (now - iat < REFRESH_AFTER_SECONDS) return null

  // Tokens issued before authTime existed fall back to their own issue time.
  const originalSignIn = typeof authTime === 'number' ? authTime : iat
  if (now - originalSignIn >= MAX_SESSION_SECONDS) return null

  return signSessionToken({ id: userId, email }, secret, originalSignIn)
}
