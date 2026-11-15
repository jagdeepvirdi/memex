// YouTube Data API v3 — video details (mainly the description).
//
// Why: spoken transcripts rarely contain a recipe's ingredient list or a tutorial's links; the video
// description usually does. It also gives Explain / Extract recipe something to work from when captions
// are disabled. Optional: with no key configured every function here returns null and nothing changes.
//
// The key is sent in the X-Goog-Api-Key header, not the URL, so it cannot end up in logs, proxies
// or redirect chains. It is never logged, and error text is redacted before leaving this module.

import { getApiKey, redactSecrets } from './apiKeys.js'
import { getSetting, asBool } from './settings.js'
import logger from '../lib/logger.js'

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos'
const TIMEOUT_MS = 10_000
/** Descriptions can be huge (link farms, timestamps); keep what a small model can use. */
export const MAX_DESCRIPTION_CHARS = 5000

export interface VideoDetails {
  description: string
  channelTitle?: string
  publishedAt?: string
  durationSeconds?: number
}

export type YoutubeProblem = 'auth' | 'quota' | 'unavailable'

/** ISO 8601 duration (`PT1H2M3S`) → seconds. Returns undefined for anything else (e.g. live streams: `P0D`). */
export function parseIsoDuration(iso: unknown): number | undefined {
  if (typeof iso !== 'string') return undefined
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return undefined
  const [d, h, min, s] = [m[1], m[2], m[3], m[4]].map(v => (v ? parseInt(v, 10) : 0))
  const total = d * 86400 + h * 3600 + min * 60 + s
  return total > 0 ? total : undefined
}

type Outcome =
  | { ok: true; details: VideoDetails | null }
  | { ok: false; kind: YoutubeProblem; message: string }

const AUTH_REASONS = new Set(['keyInvalid', 'accessNotConfigured', 'forbidden', 'ipRefererBlocked', 'keyExpired', 'badRequest'])
const QUOTA_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'])

async function requestVideo(videoId: string, key: string): Promise<Outcome> {
  let res: Response
  try {
    res = await fetch(`${ENDPOINT}?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`, {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    return { ok: false, kind: 'unavailable', message: redactSecrets(err instanceof Error ? err.message : 'Request failed') }
  }

  if (!res.ok) {
    let reason = ''
    let message = `YouTube API returned HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string; errors?: Array<{ reason?: string }> } }
      reason = body.error?.errors?.[0]?.reason ?? ''
      if (body.error?.message) message = body.error.message
    } catch { /* non-JSON error body */ }
    const kind: YoutubeProblem =
      QUOTA_REASONS.has(reason) ? 'quota'
      : AUTH_REASONS.has(reason) || res.status === 400 || res.status === 401 || res.status === 403 ? 'auth'
      : 'unavailable'
    return { ok: false, kind, message: redactSecrets(message).slice(0, 300) }
  }

  const body = (await res.json()) as {
    items?: Array<{
      snippet?: { description?: string; channelTitle?: string; publishedAt?: string }
      contentDetails?: { duration?: string }
    }>
  }
  const item = body.items?.[0]
  // Empty `items` = the video is private, removed or the id is wrong: a valid key, nothing to return.
  if (!item?.snippet) return { ok: true, details: null }
  return {
    ok: true,
    details: {
      description: (item.snippet.description ?? '').trim().slice(0, MAX_DESCRIPTION_CHARS),
      channelTitle: item.snippet.channelTitle || undefined,
      publishedAt: item.snippet.publishedAt || undefined,
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    },
  }
}

/**
 * Details for one video, or null when there is no key, Strict Local Mode is on, the video is
 * unavailable, or the API failed (quota, bad key, network). Never throws; callers fall back to the
 * transcript alone.
 */
export async function fetchVideoDetails(videoId: string): Promise<VideoDetails | null> {
  try {
    if (asBool(await getSetting<unknown>('strict_local_mode', false))) return null
    const key = await getApiKey('youtube')
    if (!key) return null
    const out = await requestVideo(videoId, key)
    if (!out.ok) {
      logger.warn({ kind: out.kind }, 'YouTube API request failed')
      return null
    }
    return out.details
  } catch (err) {
    logger.warn({ err: redactSecrets(err instanceof Error ? err.message : String(err)) }, 'YouTube API lookup failed')
    return null
  }
}

export type KeyCheck =
  | { ok: true }
  | { ok: false; kind: YoutubeProblem | 'missing' | 'blocked'; error: string }

/** One real request for a well-known public video, to confirm the saved key works (costs 1 quota unit). */
export async function checkYoutubeKey(): Promise<KeyCheck> {
  if (asBool(await getSetting<unknown>('strict_local_mode', false))) {
    return { ok: false, kind: 'blocked', error: 'Strict Local Mode is on, so external requests are blocked.' }
  }
  const key = await getApiKey('youtube')
  if (!key) return { ok: false, kind: 'missing', error: 'No YouTube API key is configured.' }
  const out = await requestVideo('dQw4w9WgXcQ', key)
  if (!out.ok) return { ok: false, kind: out.kind, error: out.message }
  return out.details ? { ok: true } : { ok: false, kind: 'unavailable', error: 'The key was accepted but the test video returned nothing.' }
}
