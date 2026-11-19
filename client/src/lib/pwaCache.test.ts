import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearLegacyApiCache } from './pwaCache'

afterEach(() => vi.unstubAllGlobals())

describe('clearLegacyApiCache', () => {
  it('deletes the old API cache while preserving other offline assets', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', { delete: deleteCache })

    await clearLegacyApiCache()

    expect(deleteCache).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledWith('api-cache')
  })

  it('does not block startup when CacheStorage is unavailable', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(clearLegacyApiCache()).resolves.toBeUndefined()
  })
})
