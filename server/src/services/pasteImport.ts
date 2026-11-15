// Bulk paste import: split a pasted blob into separate entries, work out where each came from,
// drop duplicates, and save the rest instantly (classification then runs in the background).

import { createHash } from 'crypto'
import pLimit from 'p-limit'
import type { PoolClient } from 'pg'
import { detectPasteSource } from './sourceDetect.js'
import { normalizeSourceUrl } from './urlNormalize.js'
import { findItemsBySourceUrl } from './duplicateService.js'
import type { ItemSource } from '../../../shared/types.js'

export const MAX_PASTE_ENTRIES = 200
export const MAX_PASTE_CHARS = 1_000_000
/** One entry longer than this is skipped rather than silently truncated. */
export const MAX_ENTRY_CHARS = 20_000

const URL_LINE = /^https?:\/\/\S+$/i
const SEPARATOR_LINE = /^\s*-{3,}\s*$/

/**
 * Splits pasted text into entries. Rules, first match wins:
 * 1. any line of 3+ dashes (`---`) is an explicit separator;
 * 2. if every non-empty line is a bare URL, each URL is its own entry;
 * 3. otherwise entries are separated by blank lines.
 */
export function splitPaste(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const lines = text.split('\n')

  let blocks: string[]
  if (lines.some(l => SEPARATOR_LINE.test(l))) {
    blocks = []
    let current: string[] = []
    for (const line of lines) {
      if (SEPARATOR_LINE.test(line)) { blocks.push(current.join('\n')); current = [] } else current.push(line)
    }
    blocks.push(current.join('\n'))
  } else if (lines.filter(l => l.trim()).every(l => URL_LINE.test(l.trim()))) {
    blocks = lines.filter(l => l.trim()).map(l => l.trim())
  } else {
    blocks = text.split(/\n[ \t]*\n/)
  }
  return blocks.map(b => b.trim()).filter(Boolean)
}

export type PasteSkipReason = 'too-long' | 'duplicate-in-paste' | 'already-saved'

export interface PlannedEntry {
  index: number
  text: string
  /** Short label for the preview list. */
  title: string
  source: ItemSource
  sourceUrl?: string
  status: 'new' | 'skipped'
  reason?: PasteSkipReason
  /** For `already-saved`: the existing item. */
  existingId?: string
  existingTitle?: string
}

function label(text: string): string {
  const first = text.split('\n').find(l => l.trim())?.trim() ?? ''
  return first.length > 80 ? `${first.slice(0, 77)}…` : first
}

function textKey(text: string): string {
  return 'text:' + createHash('sha1').update(text.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex')
}

export interface PlanDeps {
  findBySourceUrl: typeof findItemsBySourceUrl
}

/** Decides, per entry, whether it will be saved or skipped (and why). Never writes anything. */
export async function planPaste(
  texts: string[],
  deps: PlanDeps = { findBySourceUrl: findItemsBySourceUrl },
): Promise<PlannedEntry[]> {
  const seen = new Set<string>()
  const planned: PlannedEntry[] = texts.map((raw, index) => {
    const text = raw.trim()
    const { source, sourceUrl } = detectPasteSource(text)
    const base: PlannedEntry = { index, text, title: label(text), source, sourceUrl, status: 'new' }
    if (text.length > MAX_ENTRY_CHARS) return { ...base, status: 'skipped', reason: 'too-long' }

    const key = (sourceUrl && normalizeSourceUrl(sourceUrl)?.normalized) || textKey(text)
    if (seen.has(key)) return { ...base, status: 'skipped', reason: 'duplicate-in-paste' }
    seen.add(key)
    return base
  })

  // Same page already in Memex (any URL spelling). Text-only entries have no stable key to look up.
  const limit = pLimit(5)
  await Promise.all(planned.map(entry => limit(async () => {
    if (entry.status !== 'new' || !entry.sourceUrl) return
    const [existing] = await deps.findBySourceUrl(entry.sourceUrl, 1)
    if (existing) {
      entry.status = 'skipped'
      entry.reason = 'already-saved'
      entry.existingId = existing.id
      entry.existingTitle = existing.title
    }
  })))

  return planned
}

/** Inserts the entries to be saved, in order, and returns their ids (parallel to the input). Caller owns the transaction. */
export async function savePlanned(client: PoolClient, entries: PlannedEntry[]): Promise<string[]> {
  const ids: string[] = []
  for (const e of entries) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO items (title, type, content, raw_content, structured, source, source_url, reviewed)
       VALUES ($1, 'note', $2, $2, '{}'::jsonb, $3, $4, FALSE) RETURNING id`,
      [e.title || 'Untitled', e.text, e.source, e.sourceUrl ?? null],
    )
    ids.push(rows[0].id)
  }
  return ids
}

/** Per-entry result stored in the job details / returned to the client. */
export interface PasteEntryResult {
  index: number
  title: string
  source: ItemSource
  sourceUrl?: string
  status: 'saved' | 'skipped'
  reason?: PasteSkipReason
  itemId?: string
  existingId?: string
  existingTitle?: string
}

