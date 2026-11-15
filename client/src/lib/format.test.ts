import { describe, it, expect } from 'vitest'
import { formatCount, relativeDays, monthsSince } from './format'

describe('formatCount', () => {
  it.each([
    [0, '0'], [7, '7'], [999, '999'], [1000, '1k'], [1234, '1.2k'], [1960, '2k'], [9999, '10k'], [12345, '12.3k'], [99_999, '100k'],
    [252_629, '253k'], [1_000_000, '1M'], [1_234_567, '1.2M'], [4_000_000_000, '4B'],
  ])('%i → %s', (n, text) => {
    expect(formatCount(n)).toBe(text)
  })

  it('is safe for nonsense', () => {
    expect(formatCount(-5)).toBe('0')
    expect(formatCount(Number.NaN)).toBe('0')
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('0')
  })
})

describe('relativeDays', () => {
  const NOW = new Date('2026-11-15T12:00:00Z')
  const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

  it.each([
    [0, 'today'], [1, 'yesterday'], [2, '2 days ago'], [29, '29 days ago'], [30, '1 month ago'], [75, '2 months ago'],
    [364, '11 months ago'], [365, '1 year ago'], [800, '2 years ago'],
  ])('%i days → %s', (days, text) => {
    expect(relativeDays(ago(days), NOW)).toBe(text)
  })

  it('treats a slightly-future date (clock skew) as today, never "in the future"', () => {
    expect(relativeDays(new Date(NOW.getTime() + 3_600_000).toISOString(), NOW)).toBe('today')
  })

  it('returns an empty string for missing or invalid dates', () => {
    expect(relativeDays(undefined, NOW)).toBe('')
    expect(relativeDays(null, NOW)).toBe('')
    expect(relativeDays('', NOW)).toBe('')
    expect(relativeDays('not a date', NOW)).toBe('')
  })
})

describe('monthsSince', () => {
  const NOW = new Date('2026-11-15T00:00:00Z')
  it('counts whole 30-day months, never negative', () => {
    expect(monthsSince('2026-11-01T00:00:00Z', NOW)).toBe(0)
    expect(monthsSince('2025-11-15T00:00:00Z', NOW)).toBe(12)
    expect(monthsSince('2027-01-01T00:00:00Z', NOW)).toBe(0)
  })
  it('is undefined for missing or invalid dates', () => {
    expect(monthsSince(undefined, NOW)).toBeUndefined()
    expect(monthsSince('nope', NOW)).toBeUndefined()
  })
})
