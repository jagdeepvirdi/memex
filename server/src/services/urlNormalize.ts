import { extractYoutubeId } from './youtubeUrl.js'

// Query params that identify the visitor/campaign, not the page.
const TRACKING_PARAMS = new Set(['si', 'igsh', 'igshid', 'fbclid', 'gclid', 'dclid', 'msclkid', 'ref', 'ref_src', 'ref_url', 'feature', 'mc_cid', 'mc_eid'])

export interface NormalizedUrl {
  /** Canonical form used to compare two saved URLs. */
  normalized: string
  /** Narrow token present in any stored spelling of this URL — used to pre-filter rows with ILIKE. */
  searchKey: string
}

/**
 * Normalises a URL so the same page saved twice compares equal:
 * - every YouTube form (watch, youtu.be, Shorts, m., music., embed, live) → `https://www.youtube.com/watch?v=<id>`
 * - otherwise: scheme, `www.`, fragment, trailing slash, tracking params (utm_*, si, igsh, fbclid…) and query order are ignored;
 *   GitHub paths are case-insensitive and lose `.git`.
 * Returns null for anything that is not an http(s) URL.
 */
export function normalizeSourceUrl(raw: string): NormalizedUrl | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const videoId = extractYoutubeId(url.href)
  if (videoId) return { normalized: `https://www.youtube.com/watch?v=${videoId}`, searchKey: videoId }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let path = url.pathname.replace(/\/+$/, '')
  if (host === 'github.com') path = path.toLowerCase().replace(/\.git$/, '')

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : ''

  return { normalized: `${host}${path}${query}`, searchKey: `${host}${path}` }
}

/** True when two URLs point at the same page after normalisation. */
export function sameSourceUrl(a: string, b: string): boolean {
  const na = normalizeSourceUrl(a)
  const nb = normalizeSourceUrl(b)
  return !!na && !!nb && na.normalized === nb.normalized
}
