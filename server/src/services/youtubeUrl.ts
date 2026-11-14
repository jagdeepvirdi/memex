// Pure YouTube URL helpers. Kept free of DB/network imports so route helpers
// (e.g. sourceDetect) can use them without pulling in the scraper.

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
const YT_PATH_PREFIXES = new Set(['shorts', 'embed', 'live', 'v', 'e'])

export interface YoutubeUrlMatch {
  url: string
  videoId: string
}

/**
 * Extracts an 11-char video id from watch / youtu.be / Shorts / embed / live URLs
 * (including m. and music. hosts). Playlist-only and channel URLs return null.
 */
export function extractYoutubeId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase()

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = parsed.pathname.split('/')[1] ?? ''
    return YT_ID.test(id) ? id : null
  }
  if (!YT_HOSTS.has(host)) return null

  const v = parsed.searchParams.get('v')
  if (v && YT_ID.test(v)) return v

  const [prefix, id] = parsed.pathname.split('/').filter(Boolean)
  if (prefix && YT_PATH_PREFIXES.has(prefix) && id && YT_ID.test(id)) return id
  return null
}

/** Every YouTube URL in free text, de-duplicated by video id, in order of appearance. */
export function findYoutubeUrls(text: string): YoutubeUrlMatch[] {
  const seen = new Set<string>()
  const found: YoutubeUrlMatch[] = []
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = match[0].replace(/[.,;!?]+$/, '')
    const videoId = extractYoutubeId(url)
    if (videoId && !seen.has(videoId)) {
      seen.add(videoId)
      found.push({ url, videoId })
    }
  }
  return found
}

/** The first YouTube URL inside free text (e.g. a pasted note). */
export function findYoutubeUrl(text: string): YoutubeUrlMatch | null {
  return findYoutubeUrls(text)[0] ?? null
}
