import { pool } from '../db/client.js'
import { CLOUD_SAFE_COLS } from '../db/helpers.js'
import logger from '../lib/logger.js'
import { scrapeUrl, type ScrapedContent } from './scraper.js'
import { classify, type ClassificationResult } from './classifier.js'
import { buildYoutubeClassifierText } from './summarizer.js'
import { applyClassificationResult } from './itemService.js'
import { cloudSafe, type CloudSafeItem } from './cloudSafe.js'
import { findYoutubeUrls } from './youtubeUrl.js'
import { updateJobProgress, completeJob, failJob, saveJobDetails } from './ingestJobs.js'

export const BACKFILL_KIND = 'youtube-backfill'
/** A note with more text than this (links stripped) is a note that mentions a video, not a bookmark. */
export const SHORT_TEXT_MAX = 200
/** Stop after this many fetch failures in a row — YouTube is most likely rate-limiting us. */
export const MAX_CONSECUTIVE_FAILURES = 5
/** Polite pause between videos (jittered). */
export const DELAY_MIN_MS = 1500
export const DELAY_MAX_MS = 2500

export type SkipReason = 'protected' | 'reviewed' | 'already-backfilled' | 'needs-split' | 'note-with-link'

export interface BackfillRow extends CloudSafeItem {
  id: string
  title: string
  content: string
  source_url: string | null
  reviewed: boolean
}

export interface BackfillCandidate {
  id: string
  title: string
  videoId: string
  url: string
}

export interface BackfillSkip {
  id: string
  title: string
  reason: SkipReason
  videoIds: string[]
}

export interface DuplicateGroup {
  videoId: string
  itemIds: string[]
}

export interface BackfillPlan {
  candidates: BackfillCandidate[]
  skipped: BackfillSkip[]
  duplicates: DuplicateGroup[]
}

export interface ItemResult {
  id: string
  title: string
  videoId: string
  status: 'applied' | 'skipped' | 'failed' | 'preview'
  reason?: string
  warning?: string
  before?: { title: string; type?: string | null }
  after?: { title: string; type: string; categories: string[]; confidence: number; videoKind?: unknown }
}

/** Text of a note with every URL removed — what the user actually wrote. */
export function textWithoutUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"')]+/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Pure planning step: decides, per item, whether the backfill may touch it.
 * Only items with exactly one distinct video and a short caption are candidates;
 * everything else is reported so the user can handle it by hand.
 */
export function planBackfill(rows: BackfillRow[], alreadyDone: ReadonlySet<string>): BackfillPlan {
  const candidates: BackfillCandidate[] = []
  const skipped: BackfillSkip[] = []
  const byVideo = new Map<string, string[]>()

  for (const row of rows) {
    const found = findYoutubeUrls(`${row.content ?? ''}\n${row.source_url ?? ''}`)
    if (found.length === 0) continue
    const videoIds = found.map((f) => f.videoId)
    for (const id of videoIds) byVideo.set(id, [...(byVideo.get(id) ?? []), row.id])

    const skip = (reason: SkipReason) => skipped.push({ id: row.id, title: row.title, reason, videoIds })

    if (!cloudSafe(row)) skip('protected')
    else if (alreadyDone.has(row.id)) skip('already-backfilled')
    else if (row.reviewed) skip('reviewed')
    else if (found.length > 1) skip('needs-split')
    else if (textWithoutUrls(row.content ?? '').length > SHORT_TEXT_MAX) skip('note-with-link')
    else candidates.push({ id: row.id, title: row.title, videoId: found[0].videoId, url: `https://www.youtube.com/watch?v=${found[0].videoId}` })
  }

  const duplicates = [...byVideo.entries()]
    .map(([videoId, ids]) => ({ videoId, itemIds: [...new Set(ids)] }))
    .filter((g) => g.itemIds.length > 1)

  return { candidates, skipped, duplicates }
}

const YOUTUBE_SQL = `(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)`

/** Reads live, unencrypted items that mention YouTube and plans the backfill. */
export async function loadBackfillPlan(): Promise<BackfillPlan> {
  const [{ rows }, { rows: done }] = await Promise.all([
    pool.query<BackfillRow>(
      `SELECT i.id, i.title, i.content, i.source_url, i.reviewed, ${CLOUD_SAFE_COLS}
       FROM items i
       WHERE i.deleted_at IS NULL AND i.encrypted IS NOT TRUE
         AND (i.content ~* $1 OR COALESCE(i.source_url, '') ~* $1)
       ORDER BY i.created_at
       LIMIT 2000`,
      [YOUTUBE_SQL],
    ),
    pool.query<{ item_id: string }>(
      `SELECT DISTINCT item_id FROM item_extractions WHERE structured->>'videoId' IS NOT NULL`,
    ),
  ])
  return planBackfill(rows, new Set(done.map((d) => d.item_id)))
}

// ── Per-item processing ──────────────────────────────────────────────────────

export type ApplyOutcome = 'applied' | 'reviewed' | 'gone'

export interface BackfillDeps {
  scrape: (url: string) => Promise<ScrapedContent>
  classify: typeof classify
  /** Writes the result via the versioned extraction path. Must re-check `reviewed` itself. */
  apply: (itemId: string, url: string, result: ClassificationResult) => Promise<ApplyOutcome>
  sleep: (ms: number) => Promise<void>
}

/** Writes through item_extractions. Re-checks reviewed/deleted inside the transaction. */
export async function applyToItem(itemId: string, url: string, result: ClassificationResult): Promise<ApplyOutcome> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ reviewed: boolean; deleted_at: Date | null }>(
      'SELECT reviewed, deleted_at FROM items WHERE id=$1 FOR UPDATE',
      [itemId],
    )
    if (rows.length === 0 || rows[0].deleted_at) {
      await client.query('ROLLBACK')
      return 'gone'
    }
    if (rows[0].reviewed) {
      await client.query('ROLLBACK')
      return 'reviewed'
    }
    // Never touches content — the user's own note text is preserved.
    await client.query(
      `UPDATE items SET source_url = CASE WHEN source_url IS NULL OR source_url = '' THEN $2 ELSE source_url END WHERE id=$1`,
      [itemId, url],
    )
    await applyClassificationResult(client, itemId, result, false)
    await client.query('COMMIT')
    return 'applied'
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export const defaultDeps: BackfillDeps = {
  scrape: scrapeUrl,
  classify,
  apply: applyToItem,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}

/** Nothing usable came back from YouTube: no transcript and no oEmbed metadata. */
export function isHardFailure(scraped: ScrapedContent): boolean {
  return !scraped.transcriptAvailable && !scraped.channel
}

/** Fetches and classifies one video. Writes nothing. Throws on scrape/classify errors. */
export async function previewCandidate(
  c: BackfillCandidate,
  deps: Pick<BackfillDeps, 'scrape' | 'classify'>,
): Promise<{ scraped: ScrapedContent; result: ClassificationResult; warning?: string }> {
  const scraped = await deps.scrape(c.url)
  if (isHardFailure(scraped)) throw new Error(scraped.failure ?? 'No metadata or transcript available (private or removed video?)')

  const result = await deps.classify(buildYoutubeClassifierText(scraped), {
    sourceUrl: c.url,
    video: { videoId: scraped.videoId, channel: scraped.channel, transcriptAvailable: scraped.transcriptAvailable ?? false },
  })
  const warning = scraped.transcriptAvailable ? undefined : `No transcript${scraped.failure ? `: ${scraped.failure}` : ''} — classified from title/channel only`
  return { scraped, result, warning }
}

function summarise(result: ClassificationResult): NonNullable<ItemResult['after']> {
  return {
    title: result.title,
    type: result.type,
    categories: result.categories,
    confidence: result.confidence,
    videoKind: result.structured?.videoKind,
  }
}

/** Dry-run sample: fetch + classify a few items, return before/after, write nothing. */
export async function previewSample(
  candidates: BackfillCandidate[],
  rowsById: ReadonlyMap<string, { title: string; type?: string | null }>,
  deps: Pick<BackfillDeps, 'scrape' | 'classify' | 'sleep'> = defaultDeps,
): Promise<ItemResult[]> {
  const out: ItemResult[] = []
  for (const [i, c] of candidates.entries()) {
    if (i > 0) await deps.sleep(jitter())
    const before = { title: c.title, type: rowsById.get(c.id)?.type }
    try {
      const { result, warning } = await previewCandidate(c, deps)
      out.push({ id: c.id, title: c.title, videoId: c.videoId, status: 'preview', before, after: summarise(result), warning })
    } catch (err) {
      out.push({ id: c.id, title: c.title, videoId: c.videoId, status: 'failed', before, reason: errMsg(err) })
    }
  }
  return out
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const jitter = () => DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)

export interface RunSummary {
  applied: number
  skipped: number
  failed: number
  aborted: boolean
}

/**
 * Applies the backfill one video at a time with a polite delay, recording a per-item
 * result list in the job's `details`. Completes the job once at the end (or fails it
 * with a summary if any item failed / the run was aborted).
 */
export async function runBackfill(
  jobId: string,
  plan: BackfillPlan,
  deps: BackfillDeps = defaultDeps,
): Promise<RunSummary> {
  const { candidates } = plan
  const results: ItemResult[] = []
  const summary: RunSummary = { applied: 0, skipped: 0, failed: 0, aborted: false }
  let consecutiveFailures = 0

  const details = () => ({ results, skipped: plan.skipped, duplicates: plan.duplicates, summary })

  try {
    for (const [i, c] of candidates.entries()) {
      if (i > 0) await deps.sleep(jitter())
      const base = { id: c.id, title: c.title, videoId: c.videoId }
      try {
        const { result, warning } = await previewCandidate(c, deps)
        const outcome = await deps.apply(c.id, c.url, result)
        consecutiveFailures = 0
        if (outcome === 'applied') {
          summary.applied++
          results.push({ ...base, status: 'applied', after: summarise(result), warning })
        } else {
          summary.skipped++
          results.push({ ...base, status: 'skipped', reason: outcome === 'reviewed' ? 'reviewed since the plan was made' : 'item was deleted' })
        }
      } catch (err) {
        summary.failed++
        consecutiveFailures++
        results.push({ ...base, status: 'failed', reason: errMsg(err) })
        logger.error(`[YT backfill] ${c.id} (${c.videoId}) failed: ${errMsg(err)}`)
      }

      await updateJobProgress(jobId, i + 1, candidates.length).catch(() => {})
      if ((i + 1) % 5 === 0) await saveJobDetails(jobId, details()).catch(() => {})

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        summary.aborted = true
        break
      }
    }

    if (summary.aborted) {
      await failJob(jobId, `Stopped after ${MAX_CONSECUTIVE_FAILURES} failures in a row (YouTube may be rate-limiting). Re-run later — finished items are skipped.`, details())
    } else {
      // Per-item failures are listed in details.results / details.summary.failed; the run itself finished.
      await completeJob(jobId, details())
    }
  } catch (err) {
    await failJob(jobId, errMsg(err), details()).catch(() => {})
    throw err
  }
  return summary
}
