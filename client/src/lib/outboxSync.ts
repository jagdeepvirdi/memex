// Sends what the phone kept for later. It reuses the same two calls the capture screen makes (read and classify, then
// save), so a queued item gets exactly what a typed one gets: its repo stats, its recipe, the places named in it.
//
// Rules, in order of importance:
//   1. An item leaves the outbox only after the server confirmed it (saved, or "you already have this").
//   2. Nothing is ever dropped because the laptop was off, the session ran out, or the server was busy: those stop the
//      run and leave every remaining item waiting.
//   3. A link or note the server permanently cannot handle is marked failed with the reason, and stays until the person
//      removes it.

import { ApiError, SessionExpiredError, apiFetch, createItem, ingestUrl, pingServer } from './api'
import { previewToCreateRequest, type IngestPreview } from './ingest'
import { listOutbox, removeFromOutbox, updateOutboxItem, type OutboxItem } from './outbox'
import type { SimilarItem } from '../../../shared/types'

/** A failing item is retried this many times before it is marked failed. */
export const MAX_ATTEMPTS = 3

export type SendOutcome =
  | { kind: 'sent'; title: string; places: number }
  | { kind: 'duplicate'; title: string }
  | { kind: 'auth' }
  | { kind: 'unreachable' }
  | { kind: 'busy' }
  | { kind: 'failed'; message: string; retryable: boolean }

interface PreviewResponse { preview: IngestPreview; similarItems?: SimilarItem[] }

/** An exact match (same link, or the same text) is how the server reports "you already have this". */
const exactMatch = (similar: SimilarItem[] | undefined) => similar?.find((s) => s.similarity >= 1)

export async function sendOutboxItem(item: OutboxItem): Promise<SendOutcome> {
  try {
    const data: PreviewResponse = item.kind === 'url'
      ? await ingestUrl(item.value) as unknown as PreviewResponse
      : await apiFetch<PreviewResponse>('/ingest/text', { method: 'POST', body: JSON.stringify({ text: item.value }) })

    const already = exactMatch(data.similarItems)
    if (already) return { kind: 'duplicate', title: already.title }

    // The preview's own content for a link (the page text); for a note it is the text that was sent.
    const preview: IngestPreview = item.kind === 'text' ? { ...data.preview, content: item.value } : data.preview
    const places = preview.places ?? []
    const saved = await createItem(previewToCreateRequest(preview, null, places))
    return { kind: 'sent', title: saved.title, places: places.length }
  } catch (err) {
    if (err instanceof SessionExpiredError) return { kind: 'auth' }
    if (err instanceof ApiError) {
      if (err.status === 429) return { kind: 'busy' }
      if (err.status === 502 || err.status === 503 || err.status === 504) return { kind: 'unreachable' }
      // 500 is usually "could not read that page / classify it": worth a few tries, then it is the item that is the problem.
      return { kind: 'failed', message: err.message, retryable: err.status >= 500 }
    }
    // fetch() itself failed (no route to the laptop, it went to sleep mid-way): the item is fine, the connection is not.
    return { kind: 'unreachable' }
  }
}

export interface FlushSummary {
  /** Why the run stopped early, if it did. */
  stoppedBecause?: 'unreachable' | 'auth' | 'busy'
  sent: number
  duplicates: number
  failed: number
  /** Places created alongside the sent items. */
  places: number
  /** Still waiting after the run. */
  remaining: number
}

/** Sends everything waiting, oldest first, one at a time. Never throws. */
export async function flushOutbox(): Promise<FlushSummary> {
  const summary: FlushSummary = { sent: 0, duplicates: 0, failed: 0, places: 0, remaining: 0 }
  const waiting = (await listOutbox()).filter((i) => i.status === 'waiting')
  if (waiting.length === 0) return summary

  if (!(await pingServer())) {
    return { ...summary, stoppedBecause: 'unreachable', remaining: waiting.length }
  }

  for (let index = 0; index < waiting.length; index++) {
    const item = waiting[index]
    const outcome = await sendOutboxItem(item)

    if (outcome.kind === 'sent' || outcome.kind === 'duplicate') {
      await removeFromOutbox(item.id)
      if (outcome.kind === 'sent') { summary.sent++; summary.places += outcome.places } else summary.duplicates++
      continue
    }
    if (outcome.kind === 'failed') {
      const attempts = item.attempts + 1
      const permanent = !outcome.retryable || attempts >= MAX_ATTEMPTS
      await updateOutboxItem(item.id, { attempts, lastError: outcome.message, status: permanent ? 'failed' : 'waiting' })
      if (permanent) summary.failed++
      else summary.remaining++
      continue
    }
    // unreachable / auth / busy: stop, keep this item and everything after it exactly as they were.
    summary.stoppedBecause = outcome.kind
    summary.remaining += waiting.length - index
    return summary
  }
  return summary
}

const RETRY_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 600_000]

/**
 * How long to wait before the next automatic try. `misses` is how many tries in a row found Memex unreachable or busy:
 * the laptop may be off all weekend, so the phone asks less and less often (30 s ... 10 min) instead of draining the
 * battery. Any event that suggests things changed (app opened, network back) resets it.
 */
export function autoRetryDelay(misses: number): number {
  return RETRY_STEPS_MS[Math.min(Math.max(misses, 0), RETRY_STEPS_MS.length - 1)]
}

/** One sentence for a toast or the outbox panel. */
export function describeFlush(s: FlushSummary): string {
  const parts: string[] = []
  if (s.sent > 0) parts.push(`${s.sent} saved${s.places > 0 ? ` (plus ${s.places} place${s.places === 1 ? '' : 's'})` : ''}`)
  if (s.duplicates > 0) parts.push(`${s.duplicates} already in Memex`)
  if (s.failed > 0) parts.push(`${s.failed} could not be saved`)
  const head = parts.join(', ')
  switch (s.stoppedBecause) {
    case 'unreachable': return `${head ? `${head}. ` : ''}Memex is not reachable right now. ${s.remaining} still waiting on this phone.`
    case 'auth': return `${head ? `${head}. ` : ''}Sign in again to send the ${s.remaining} still waiting.`
    case 'busy': return `${head ? `${head}. ` : ''}Memex is busy. ${s.remaining} still waiting; try again in a minute.`
    default: return head || 'Nothing was waiting.'
  }
}
