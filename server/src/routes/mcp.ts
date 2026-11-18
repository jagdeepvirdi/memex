// The routes behind the Memex MCP server (see /mcp). An AI assistant uses them through a scoped key (lib/mcpScope.ts)
// that can reach nothing else.
//
// Privacy: the assistant is usually a cloud model, so what it may read is held to the same rule as a cloud AI call.
// Items that `cloudSafe()` keeps home (vault, Passwords / Personal, private / no-cloud / local-only tags, text that
// looks like account details) are never returned: search skips them and says only HOW MANY it held back, and reading
// one by id is refused. Strict Local Mode turns the whole router off. There is deliberately no "ask" route: the
// assistant reasons over what search returns, so no private text is mixed into an answer that leaves this machine.

import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { pool } from '../db/client.js'
import { rowToItem, ITEM_SELECT_SQL } from '../db/helpers.js'
import { retrieveItems, COLUMNS } from '../services/retrievalService.js'
import { cloudSafeReason } from '../services/cloudSafe.js'
import { quickSaveText, quickSaveUrl } from '../services/quickSave.js'
import { getSetting, asBool } from '../services/settings.js'
import logger from '../lib/logger.js'
import type { Item } from '../../../shared/types.js'

const router = Router()

const SNIPPET_CHARS = 400
const FULL_CONTENT_CHARS = 20_000
const MCP_TAG = 'from-mcp'
const ITEM_TYPES = ['note', 'recipe', 'media', 'spec', 'stock', 'link', 'book', 'place'] as const

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.MCP_RATE_LIMIT_MAX ?? 120),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from the assistant. Slow down.' },
})
router.use(limiter)

// Strict Local Mode means nothing leaves this machine, and an assistant on the other end of this router would read
// notes. So the whole router is off while it is on.
router.use(async (_req: Request, res: Response, next: NextFunction) => {
  if (asBool(await getSetting('strict_local_mode', false))) {
    return res.status(403).json({ error: 'Strict Local Mode is on in Memex, so assistants cannot read or save notes. Turn it off in Settings > Keys & Privacy.' })
  }
  next()
})

/** True when the item may be shown to an assistant. */
function shareable(item: Item): boolean {
  return cloudSafeReason({
    type: item.type, encrypted: item.encrypted, categories: item.categories, tags: item.tags,
    title: item.title, content: item.content,
  }) === null
}

function summaryOf(item: Item): string | undefined {
  const s = (item.structured as Record<string, unknown> | undefined)?.summary
  return typeof s === 'string' && s.trim() ? s.trim() : undefined
}

/** A short view for lists: enough to decide whether to open the item. */
export function toListEntry(item: Item) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    summary: summaryOf(item),
    snippet: item.content.length > SNIPPET_CHARS ? `${item.content.slice(0, SNIPPET_CHARS)}...` : item.content,
    categories: item.categories,
    tags: item.tags,
    sourceUrl: item.sourceUrl,
    createdAt: item.createdAt,
  }
}

function toFullItem(item: Item) {
  const truncated = item.content.length > FULL_CONTENT_CHARS
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    summary: summaryOf(item),
    content: truncated ? item.content.slice(0, FULL_CONTENT_CHARS) : item.content,
    contentTruncated: truncated || undefined,
    structured: item.structured,
    categories: item.categories,
    tags: item.tags,
    source: item.source,
    sourceUrl: item.sourceUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

const SearchQuery = z.object({
  q: z.string().trim().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  type: z.enum(ITEM_TYPES).optional(),
  tag: z.string().trim().min(1).max(100).optional(),
})

// GET /api/mcp/search?q=&limit=&type=&tag=
router.get('/search', async (req, res) => {
  const parsed = SearchQuery.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid search: q is required (1-500 characters), limit 1-20.' })
  const { q, limit, type, tag } = parsed.data
  try {
    // Ask for extra rows: some may be private and are dropped below.
    const { items, semantic } = await retrieveItems({ query: q, type, tag, limit: Math.min(limit + 15, 50) })
    const allowed = items.filter(shareable)
    res.json({
      results: allowed.slice(0, limit).map(toListEntry),
      semantic,
      // A count only: nothing about the held-back items (no titles, no reasons).
      withheldPrivate: items.length - allowed.length,
    })
  } catch (error) {
    logger.error(error, 'MCP search error')
    res.status(500).json({ error: 'Search failed' })
  }
})

const RecentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(10),
  type: z.enum(ITEM_TYPES).optional(),
})

// GET /api/mcp/recent?limit=&type=
router.get('/recent', async (req, res) => {
  const parsed = RecentQuery.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request: limit is 1-30.' })
  const { limit, type } = parsed.data
  try {
    const params: unknown[] = []
    const typeSql = type ? (params.push(type), `AND i.type = $${params.length}`) : ''
    params.push(Math.min(limit + 15, 60))
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM items i
       WHERE i.deleted_at IS NULL AND i.encrypted = false ${typeSql}
       ORDER BY i.created_at DESC
       LIMIT $${params.length}`,
      params,
    )
    const items = rows.map(rowToItem)
    const allowed = items.filter(shareable)
    res.json({ results: allowed.slice(0, limit).map(toListEntry), withheldPrivate: items.length - allowed.length })
  } catch (error) {
    logger.error(error, 'MCP recent error')
    res.status(500).json({ error: 'Failed to list recent items' })
  }
})

// GET /api/mcp/items/:id
router.get('/items/:id', async (req, res) => {
  const id = z.guid().safeParse(req.params.id)
  if (!id.success) return res.status(400).json({ error: 'Invalid item id' })
  try {
    const { rows } = await pool.query(ITEM_SELECT_SQL, [id.data])
    if (!rows[0]) return res.status(404).json({ error: 'No item with that id' })
    const item = rowToItem(rows[0])
    if (!shareable(item)) {
      return res.status(403).json({ error: 'This item is private in Memex and is not shared with assistants.' })
    }
    res.json(toFullItem(item))
  } catch (error) {
    logger.error(error, 'MCP get item error')
    res.status(500).json({ error: 'Failed to read the item' })
  }
})

const NoteBody = z.object({
  content: z.string().trim().min(1).max(20_000),
  title: z.string().trim().min(1).max(300).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
})

// POST /api/mcp/notes { content, title?, tags? }: save a note; Memex classifies it like any other.
router.post('/notes', async (req, res) => {
  const parsed = NoteBody.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'content is required (1-20000 characters); title up to 300; at most 10 tags.' })
  try {
    const { content, title, tags } = parsed.data
    const out = await quickSaveText(content, { title, extraTags: [MCP_TAG, ...(tags ?? [])] })
    res.status(201).json(out)
  } catch (error) {
    logger.error(error, 'MCP save note error')
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save the note' })
  }
})

const LinkBody = z.object({ url: z.url().max(2000) })

// POST /api/mcp/links { url }: fetch, classify and save a page. Saving the same page twice returns the existing item.
router.post('/links', async (req, res) => {
  const parsed = LinkBody.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'url is required and must be a valid http(s) address.' })
  if (!/^https?:\/\//i.test(parsed.data.url)) return res.status(400).json({ error: 'url must start with http:// or https://' })
  try {
    res.status(201).json(await quickSaveUrl(parsed.data.url, { extraTags: [MCP_TAG] }))
  } catch (error) {
    logger.error(error, 'MCP save link error')
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save the link' })
  }
})

export default router
