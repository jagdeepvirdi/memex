import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
vi.mock('./settings.js', async (orig) => ({
  ...(await orig<typeof import('./settings.js')>()),
  getSetting: vi.fn(),
}))

import { getSetting } from './settings.js'
import { scrapeUrl } from './scraper.js'

const originalFetch = global.fetch
beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockRejectedValue(new Error('network disabled in test'))
})
afterEach(() => { global.fetch = originalFetch })

const outcome = (url = 'https://example.com/page') =>
  scrapeUrl(url).then(() => '', (e: Error) => e.message)

describe('scrapeUrl — Strict Local Mode setting', () => {
  it.each([true, 'true'])('blocks scraping when strict_local_mode is %j', async (value) => {
    vi.mocked(getSetting).mockResolvedValue(value as never)
    expect(await outcome()).toMatch(/Strict Local Mode/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // Regression: the Settings UI saved the string 'false' when the toggle was switched off,
  // and a bare truthiness check treated it as ON, blocking all scraping.
  it.each([false, 'false', undefined])('does not block scraping when strict_local_mode is %j', async (value) => {
    vi.mocked(getSetting).mockResolvedValue(value as never)
    expect(await outcome()).not.toMatch(/Strict Local Mode/)
  })
})
