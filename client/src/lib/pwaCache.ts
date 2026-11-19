/** Remove the runtime API cache created by older builds. Authenticated API responses must never persist offline. */
export async function clearLegacyApiCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    await caches.delete('api-cache')
  } catch {
    // CacheStorage can be unavailable or denied in private browsing; the app can still start without it.
  }
}
