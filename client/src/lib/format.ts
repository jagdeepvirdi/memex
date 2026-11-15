/** 12345 → "12.3k", 1_200_000 → "1.2M". Small numbers are shown as is. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1000) return String(Math.floor(n))
  const units: Array<[number, string]> = [[1_000_000_000, 'B'], [1_000_000, 'M'], [1_000, 'k']]
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size
      // One decimal below 100 ("12.3k"), none above ("252k"); never "1.0k".
      const text = v < 100 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v))
      return `${text}${suffix}`
    }
  }
  return String(n)
}

/** "today", "3 days ago", "2 months ago", "1 year ago". Returns '' for anything that is not a past-or-present date. */
export function relativeDays(iso: string | undefined | null, now: Date = new Date()): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const days = Math.floor((now.getTime() - then) / 86_400_000)
  if (days < 0) return 'today' // a clock a little ahead is still "today", not "in the future"
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) {
    const months = Math.min(11, Math.floor(days / 30))
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

/** Months since an ISO date, or undefined when it is not a valid date — used to flag "not updated in a long time". */
export function monthsSince(iso: string | undefined | null, now: Date = new Date()): number | undefined {
  if (!iso) return undefined
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return undefined
  return Math.max(0, Math.floor((now.getTime() - then) / (86_400_000 * 30)))
}
