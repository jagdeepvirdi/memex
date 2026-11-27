// Import saved links from a browser bookmarks export, Pocket or Raindrop (TASKS.md L8 "more importers").
//
// Supported files: the Netscape bookmarks HTML that Chrome, Edge, Firefox, Safari and Raindrop export, Pocket's
// `ril_export.html`, and Raindrop's CSV. One saved link per bookmark; folder names and tags become tags.
//
// Nothing here touches the network: pages are NOT fetched (no third party sees your bookmarks) and nothing is sent to an
// AI. The links are saved with the title and address only; classification afterwards uses the normal background job, so
// the usual provider and privacy settings apply. Opening an item and choosing Re-classify reads the page.

import type { PoolClient } from 'pg'
import { pool } from '../db/client.js'
import { normalizeSourceUrl, extractUrls } from './urlNormalize.js'

export const MAX_BOOKMARKS = 1000
const MAX_TAGS = 12
const MAX_TITLE = 200
/** A bookmarks export is text; this guards against someone sending something else by mistake. */
export const MAX_BOOKMARK_FILE_BYTES = 25 * 1024 * 1024

export type BookmarkSkipReason = 'not-a-link' | 'duplicate-in-file' | 'already-saved' | 'limit-reached'

export interface ParsedBookmark {
  url: string
  title: string
  tags: string[]
  /** Folder it lived in (the innermost one), for the preview. */
  folder?: string
  createdAt?: Date
}

export interface PlannedBookmark extends ParsedBookmark {
  index: number
  status: 'new' | 'skipped'
  reason?: BookmarkSkipReason
  existingId?: string
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Folders every browser has at the top; they say nothing about the link, so they do not become tags. */
const GENERIC_FOLDERS = new Set([
  'bookmarks', 'bookmarks bar', 'bookmarks toolbar', 'bookmarks menu', 'other bookmarks', 'mobile bookmarks',
  'favorites', 'favourites', 'favorites bar', 'unsorted', 'unsorted bookmarks', 'pocket export', 'imported',
])

function cleanTag(raw: string): string {
  return decodeEntities(raw).trim().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').toLowerCase().slice(0, 40)
}

function folderTag(name: string): string | null {
  if (GENERIC_FOLDERS.has(name.trim().toLowerCase())) return null
  return cleanTag(name) || null
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return undefined
  // Chrome/Pocket: seconds. Some exports: milliseconds. Firefox: microseconds.
  const ms = n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000
  const d = new Date(ms)
  return d.getFullYear() >= 1995 && d <= new Date() ? d : undefined
}

function parseDateString(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return !Number.isNaN(d.getTime()) && d.getFullYear() >= 1995 && d <= new Date() ? d : undefined
}

function titleFor(rawTitle: string, url: string): string {
  const title = decodeEntities(rawTitle.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
  if (title) return title.slice(0, MAX_TITLE)
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url.slice(0, MAX_TITLE) }
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  if (!m) return undefined
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
}

function uniqueTags(tags: (string | null)[]): string[] {
  return [...new Set(tags.filter((t): t is string => !!t))].slice(0, MAX_TAGS)
}

// ── HTML (browsers, Raindrop, Pocket) ─────────────────────────────────────────

/** Reads a Netscape bookmarks file or a Pocket export. Folders become a tag; `TAGS="a,b"` / `tags="a,b"` are kept. */
export function parseBookmarksHtml(html: string): ParsedBookmark[] {
  const out: ParsedBookmark[] = []
  const stack: string[] = []
  let pendingFolder: string | null = null
  // A Pocket export labels its two lists with a heading ("Unread", "Read Archive") and no nested folders.
  let heading: string | null = null
  const token = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>|<dl[^>]*>|<\/dl>|<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(token)) {
    if (m[1]) {
      const text = decodeEntities(m[2].replace(/<[^>]*>/g, ' ')).trim()
      if (m[1] === '3') pendingFolder = text
      else heading = text
      continue
    }
    const raw = m[0].toLowerCase()
    if (raw.startsWith('<dl')) { stack.push(pendingFolder ?? ''); pendingFolder = null; continue }
    if (raw.startsWith('</dl')) { stack.pop(); continue }

    const attrs = m[3] ?? ''
    const url = (attr(attrs, 'href') ?? '').trim()
    if (!url) continue
    const folder = [...stack].reverse().find((name) => name && !GENERIC_FOLDERS.has(name.trim().toLowerCase())) ?? (heading && !GENERIC_FOLDERS.has(heading.trim().toLowerCase()) ? heading : undefined)
    const ownTags = (attr(attrs, 'tags') ?? '').split(',')
    out.push({
      url,
      title: titleFor(m[4] ?? '', url),
      tags: uniqueTags([...ownTags.map(cleanTag), folder ? folderTag(folder) : null]),
      folder,
      createdAt: parseDate(attr(attrs, 'add_date') ?? attr(attrs, 'time_added')),
    })
  }
  return out
}

// ── CSV (Raindrop) ────────────────────────────────────────────────────────────

/** A small RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

/** Raindrop's CSV: columns `title`, `url`, `folder`, `tags`, `created` (others are ignored). */
export function parseBookmarksCsv(text: string): ParsedBookmark[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const iUrl = col('url') >= 0 ? col('url') : col('link')
  if (iUrl < 0) throw new Error('That CSV has no "url" column. Export from Raindrop as CSV, or use the HTML export.')
  const [iTitle, iFolder, iTags, iCreated] = [col('title'), col('folder'), col('tags'), col('created')]
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  return rows.slice(1).map((r) => {
    const url = get(r, iUrl)
    const folder = get(r, iFolder)
    return {
      url,
      title: titleFor(get(r, iTitle), url),
      tags: uniqueTags([...get(r, iTags).split(',').map(cleanTag), folder ? folderTag(folder) : null]),
      folder: folder || undefined,
      createdAt: parseDateString(get(r, iCreated)),
    }
  }).filter((b) => b.url !== '')
}

/** Picks the reader from the file name (and, for an unnamed type, the content). Throws a user-readable Error. */
export function readBookmarkUpload(buffer: Buffer, filename: string): ParsedBookmark[] {
  if (buffer.length > MAX_BOOKMARK_FILE_BYTES) throw new Error('That file is too large for a bookmarks export (over 25 MB).')
  const text = buffer.toString('utf8')
  if (/\.csv$/i.test(filename)) return parseBookmarksCsv(text)
  if (/\.html?$/i.test(filename) || /<a\s[^>]*href/i.test(text)) return parseBookmarksHtml(text)
  throw new Error('Upload a bookmarks export: the .html file from your browser, Pocket or Raindrop, or Raindrop\'s .csv.')
}

// ── Planning (no writes) ──────────────────────────────────────────────────────

export interface PlanDeps {
  /** Normalised URL -> id of the item that already has it. */
  loadExisting: () => Promise<Map<string, string>>
}

export const defaultPlanDeps: PlanDeps = {
  async loadExisting() {
    const known = new Map<string, string>()
    const { rows } = await pool.query<{ id: string; source_url: string | null; content: string | null }>(
      `SELECT id, source_url, CASE WHEN source_url IS NULL AND type = 'link' AND encrypted = false AND length(content) <= 600 THEN content END AS content
       FROM items WHERE deleted_at IS NULL AND encrypted = false AND type <> 'password'
         AND (source_url IS NOT NULL OR (type = 'link' AND length(content) <= 600))`,
    )
    for (const r of rows) {
      const urls = r.source_url ? [r.source_url] : extractUrls(r.content ?? '')
      for (const u of urls) {
        const key = normalizeSourceUrl(u)?.normalized
        if (key && !known.has(key)) known.set(key, r.id)
      }
    }
    return known
  },
}

/** Decides, per bookmark, whether it will be saved or skipped (and why). Never writes anything. */
export async function planBookmarks(bookmarks: ParsedBookmark[], deps: PlanDeps = defaultPlanDeps): Promise<PlannedBookmark[]> {
  const existing = await deps.loadExisting()
  const seen = new Set<string>()
  let accepted = 0
  return bookmarks.map((b, index) => {
    const base: PlannedBookmark = { ...b, index, status: 'new' }
    const skip = (reason: BookmarkSkipReason, existingId?: string): PlannedBookmark => ({ ...base, status: 'skipped', reason, existingId })
    const key = normalizeSourceUrl(b.url)?.normalized
    if (!key) return skip('not-a-link')
    if (seen.has(key)) return skip('duplicate-in-file')
    seen.add(key)
    const have = existing.get(key)
    if (have) return skip('already-saved', have)
    if (accepted >= MAX_BOOKMARKS) return skip('limit-reached')
    accepted += 1
    return base
  })
}

// ── Saving ────────────────────────────────────────────────────────────────────

export const FROM_BOOKMARKS_TAG = 'from-bookmarks'

export function bookmarkContent(b: Pick<ParsedBookmark, 'title' | 'url'>): string {
  return `${b.title}\n${b.url}`
}

/** Inserts the bookmarks to be saved, in order, and returns their ids. The caller owns the transaction. */
export async function saveBookmarks(
  client: PoolClient,
  bookmarks: PlannedBookmark[],
  setTags: (client: PoolClient, itemId: string, tags: string[]) => Promise<void>,
): Promise<string[]> {
  const ids: string[] = []
  for (const b of bookmarks) {
    const created = b.createdAt ?? new Date()
    const content = bookmarkContent(b)
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO items (title, type, content, raw_content, structured, source, source_url, reviewed, created_at, updated_at)
       VALUES ($1, 'link', $2, $2, '{}'::jsonb, 'url', $3, FALSE, $4, $4) RETURNING id`,
      [b.title, content, b.url, created],
    )
    ids.push(rows[0].id)
    await setTags(client, rows[0].id, [...new Set([FROM_BOOKMARKS_TAG, ...b.tags])].slice(0, MAX_TAGS + 1))
  }
  return ids
}
