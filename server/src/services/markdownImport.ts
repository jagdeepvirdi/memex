// Import a folder of Markdown notes (an Obsidian vault or any .md folder, zipped) into Memex (R9-01).
//
// One note per file. Nothing is written to disk and nothing is sent anywhere here: this module only parses a ZIP held in
// memory and plans what to save. Classification afterwards uses the normal background job, so the usual AI settings and
// privacy rules apply. Wikilinks and embeds are kept as plain text.

import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db/client.js'

export const MAX_MARKDOWN_ENTRIES = 500
/** One note longer than this is skipped rather than silently truncated (same limit as the paste import). */
export const MAX_NOTE_CHARS = 20_000
/** Guards against a zip bomb: the sum of declared uncompressed sizes of the files we would read. */
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024
const NOTE_EXT = /\.(md|markdown|txt)$/i
const MAX_TAGS = 12

export type MarkdownSkipReason =
  | 'not-a-note' // wrong extension
  | 'hidden-folder' // .obsidian/, .trash/, .git/ ...
  | 'empty'
  | 'too-long'
  | 'duplicate-in-zip'
  | 'already-saved'
  | 'limit-reached'

export interface ParsedNote {
  /** Path inside the zip, for the preview. */
  path: string
  title: string
  body: string
  tags: string[]
  createdAt?: Date
}

export interface PlannedNote extends ParsedNote {
  index: number
  status: 'new' | 'skipped'
  reason?: MarkdownSkipReason
  existingId?: string
}

// ── Parsing a single file ─────────────────────────────────────────────────────

function cleanTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/^["']|["']$/g, '').trim().toLowerCase()
}

/** Reads the small YAML subset notes actually use: `key: value`, `tags: [a, b]`, `tags: a, b`, and `- item` lists. */
export function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const match = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text)
  if (!match) return { data: {}, body: text }

  const data: Record<string, string | string[]> = {}
  let listKey: string | null = null
  for (const line of match[1].split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) {
      const current = data[listKey]
      data[listKey] = [...(Array.isArray(current) ? current : []), item[1].trim()]
      continue
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!kv) { listKey = null; continue }
    const key = kv[1].toLowerCase()
    const value = kv[2].trim()
    if (value === '') { listKey = key; data[key] = []; continue }
    listKey = null
    const inline = /^\[(.*)\]$/.exec(value)
    data[key] = inline ? inline[1].split(',').map((s) => s.trim()).filter(Boolean) : value.replace(/^["']|["']$/g, '')
  }
  return { data, body: text.slice(match[0].length) }
}

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : value.split(',')
}

/** Obsidian-style inline tags (#project/alpha). Headings ("# Title") and numbers ("#1") are not tags. */
export function inlineTags(body: string): string[] {
  const withoutCode = body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
  const found = new Set<string>()
  for (const m of withoutCode.matchAll(/(^|[\s(])#([A-Za-z][\w/-]{1,40})(?=$|[\s).,;:!?])/gm)) found.add(m[2].toLowerCase())
  return [...found]
}

function titleFrom(path: string, data: Record<string, string | string[]>, body: string): string {
  const fm = typeof data.title === 'string' ? data.title.trim() : ''
  if (fm) return fm.slice(0, 200)
  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(body)
  if (heading) return heading[1].trim().slice(0, 200)
  const file = path.split('/').pop() ?? path
  const stem = file.replace(NOTE_EXT, '').trim()
  // daily-note names like 2024-05-01 read better unchanged
  if (/^\d{4}-\d{2}-\d{2}$/.test(stem)) return stem
  return (stem.replace(/[_-]+/g, ' ').trim() || 'Untitled').slice(0, 200)
}

function dateFrom(data: Record<string, string | string[]>): Date | undefined {
  for (const key of ['created', 'date', 'created_at']) {
    const v = data[key]
    if (typeof v !== 'string') continue
    const d = new Date(v)
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 1990 && d <= new Date()) return d
  }
  return undefined
}

export function parseMarkdownFile(path: string, raw: string): ParsedNote {
  const { data, body } = parseFrontmatter(raw)
  const text = body.trim()
  const tags = [...new Set([...asList(data.tags), ...asList(data.tag), ...inlineTags(text)].map(cleanTag).filter(Boolean))].slice(0, MAX_TAGS)
  return { path, title: titleFrom(path, data, text), body: text, tags, createdAt: dateFrom(data) }
}

// ── Reading the zip ───────────────────────────────────────────────────────────

export interface ZipReadResult {
  notes: ParsedNote[]
  /** Files that were seen but not read as notes. */
  skipped: { path: string; reason: MarkdownSkipReason }[]
}

/** Reads notes from a zip buffer, or from one bare Markdown file. Throws `Error` with a user-readable message on a bad file. */
export function readMarkdownUpload(buffer: Buffer, filename: string): ZipReadResult {
  if (NOTE_EXT.test(filename) && !/\.zip$/i.test(filename)) {
    const note = parseMarkdownFile(filename, buffer.toString('utf8'))
    return { notes: [note], skipped: [] }
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(buffer)
  } catch {
    throw new Error('That does not look like a ZIP file. Zip your notes folder and try again.')
  }

  const notes: ParsedNote[] = []
  const skipped: ZipReadResult['skipped'] = []
  let total = 0
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const path = entry.entryName.replace(/\\/g, '/')
    if (path.split('/').some((part) => part.startsWith('.') && part !== '.' && part !== '..')) {
      skipped.push({ path, reason: 'hidden-folder' })
      continue
    }
    if (!NOTE_EXT.test(path)) { skipped.push({ path, reason: 'not-a-note' }); continue }
    total += entry.header.size
    if (total > MAX_TOTAL_BYTES) throw new Error('The ZIP is too large once unpacked (over 100 MB). Import a smaller folder.')
    notes.push(parseMarkdownFile(path, entry.getData().toString('utf8')))
  }
  return { notes, skipped }
}

// ── Planning (no writes) ──────────────────────────────────────────────────────

function noteKey(title: string, body: string): string {
  return createHash('sha1').update(`${title}\n${body}`.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex')
}

export interface PlanDeps {
  findExisting: (title: string, body: string) => Promise<{ id: string } | null>
}

export const defaultPlanDeps: PlanDeps = {
  async findExisting(title, body) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM items WHERE deleted_at IS NULL AND lower(title) = lower($1) AND content = $2 LIMIT 1`,
      [title, body],
    )
    return rows[0] ?? null
  },
}

/** Decides, per note, whether it will be saved or skipped (and why). Never writes anything. */
export async function planMarkdown(notes: ParsedNote[], deps: PlanDeps = defaultPlanDeps): Promise<PlannedNote[]> {
  const seen = new Set<string>()
  let accepted = 0
  const planned: PlannedNote[] = []
  for (const [index, note] of notes.entries()) {
    const base: PlannedNote = { ...note, index, status: 'new' }
    const skip = (reason: MarkdownSkipReason, existingId?: string): PlannedNote => ({ ...base, status: 'skipped', reason, existingId })
    if (!note.body) { planned.push(skip('empty')); continue }
    if (note.body.length > MAX_NOTE_CHARS) { planned.push(skip('too-long')); continue }
    const key = noteKey(note.title, note.body)
    if (seen.has(key)) { planned.push(skip('duplicate-in-zip')); continue }
    seen.add(key)
    if (accepted >= MAX_MARKDOWN_ENTRIES) { planned.push(skip('limit-reached')); continue }
    const existing = await deps.findExisting(note.title, note.body)
    if (existing) { planned.push(skip('already-saved', existing.id)); continue }
    accepted += 1
    planned.push(base)
  }
  return planned
}

/** Inserts the notes to be saved, in order, and returns their ids. The caller owns the transaction. */
export async function saveMarkdownNotes(
  client: PoolClient,
  notes: PlannedNote[],
  setTags: (client: PoolClient, itemId: string, tags: string[]) => Promise<void>,
): Promise<string[]> {
  const ids: string[] = []
  for (const n of notes) {
    const created = n.createdAt ?? new Date()
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO items (title, type, content, raw_content, structured, source, reviewed, created_at, updated_at)
       VALUES ($1, 'note', $2, $2, '{}'::jsonb, 'manual', FALSE, $3, $3) RETURNING id`,
      [n.title, n.body, created],
    )
    ids.push(rows[0].id)
    if (n.tags.length > 0) await setTags(client, rows[0].id, n.tags)
  }
  return ids
}
