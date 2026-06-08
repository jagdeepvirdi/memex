import { Router } from 'express'
import { z } from 'zod'
import pLimit from 'p-limit'
import AdmZip from 'adm-zip'
import { randomBytes } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/client.js'
import {
  fetchItem,
  setItemCategories,
  setItemTags,
  ITEM_SELECT_SQL,
  rowToItem,
} from '../db/helpers.js'
import { classify, mapToCategories } from '../services/classifier.js'
import { ITEM_LIST_SELECT_SQL, applyClassificationResult } from '../services/itemService.js'
import { embedItem } from '../services/embedder.js'
import { extractAndLinkEntities } from '../services/entityService.js'
import { generateDigest } from '../services/digestService.js'
import type { ItemType, ItemSource, ItemIntent } from '../../../shared/types.js'
import logger from '../lib/logger.js'

const router = Router()

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ITEM_TYPES = ['note', 'recipe', 'media', 'spec', 'stock', 'password', 'link', 'book', 'place'] as const
const ITEM_SOURCES = ['keep', 'manual', 'url', 'youtube', 'instagram'] as const

const createItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  type: z.enum(ITEM_TYPES).optional(),
  content: z.string().min(1),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  source: z.enum(ITEM_SOURCES),
  sourceUrl: z.string().url().optional(),
  encrypted: z.boolean().optional(),
  structured: z.record(z.unknown()).optional(),
})

const updateItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  structured: z.record(z.unknown()).optional(),
  deleted: z.boolean().optional(),
  reviewed: z.boolean().optional(),
  confidence: z.number().nullable().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  intent: z.enum(['actionable', 'reference', 'idea']).optional(),
})

const listQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  deleted: z.coerce.boolean().default(false),
  unreviewed: z.coerce.boolean().default(false),
  pendingEnrichment: z.coerce.boolean().default(false),
  enriched: z.coerce.boolean().default(false),
  hasReminder: z.coerce.boolean().default(false),
  maxConfidence: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// ── Row type for list query ───────────────────────────────────────────────────

interface ItemRow {
  id: string
  title: string
  type: ItemType
  content: string
  structured: Record<string, unknown>
  source: ItemSource
  source_url: string | null
  encrypted: boolean
  reviewed: boolean
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  categories: string[] | null
  tags: string[] | null
  confidence: number | null
  intent: ItemIntent | null
  remind_at: Date | null
  public_token: string | null
  share_expires_at: Date | null
}

// ── GET /api/items ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() })
    return
  }

  const { type, category, tag, q, deleted, unreviewed, pendingEnrichment, enriched, hasReminder, maxConfidence, limit, offset } = parsed.data

  const conditions: string[] = deleted ? ['i.deleted_at IS NOT NULL'] : ['i.deleted_at IS NULL']
  const params: unknown[] = []
  let p = 1

  if (type) {
    conditions.push(`i.type = $${p++}`)
    params.push(type)
  }

  if (unreviewed) {
    conditions.push(`i.reviewed = FALSE`)
  }

  if (pendingEnrichment) {
    conditions.push(`i.structured = '{}'::jsonb`)
  }

  if (enriched) {
    conditions.push(`i.structured != '{}'::jsonb`)
  }

  if (hasReminder) {
    conditions.push(`i.remind_at IS NOT NULL`)
  }

  if (maxConfidence !== undefined) {
    conditions.push(`i.confidence IS NOT NULL AND i.confidence <= $${p++}`)
    params.push(maxConfidence)
  }

  if (category) {
    conditions.push(`EXISTS (
      SELECT 1 FROM item_categories ic
      JOIN categories c ON c.id = ic.category_id
      WHERE ic.item_id = i.id AND c.name = $${p++}
    )`)
    params.push(category)
  }

  if (tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM item_tags it
      JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = i.id AND t.name = $${p++}
    )`)
    params.push(tag.toLowerCase().trim())
  }

  if (q) {
    conditions.push(`(i.title ILIKE $${p} OR i.content ILIKE $${p})`)
    params.push(`%${q}%`)
    p++
  }

  const where = conditions.join(' AND ')

  try {
    const client = await pool.connect()
    try {
      const countResult = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM items i WHERE ${where}`,
        params,
      )
      const total = parseInt(countResult.rows[0].total, 10)

      const listSql = ITEM_LIST_SELECT_SQL + `
        WHERE ${where}
        ORDER BY i.created_at DESC
        LIMIT $${p++} OFFSET $${p++}
      `
      params.push(limit, offset)

      const { rows } = await client.query<ItemRow>(listSql, params)
      const items = rows.map(rowToItem)

      res.json({ items, total, limit, offset })
    } finally {
      client.release()
    }
  } catch (err) {
    logger.error(err, 'GET /api/items error')
    res.status(500).json({ error: 'Failed to fetch items' })
  }
})

// ── POST /api/items ───────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const body = parsed.data
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Auto-classify if no type/title provided
    let type = body.type
    let title = body.title
    let categories = body.categories ?? []
    let tags = body.tags ?? []
    let structured = body.structured ?? {}
    let reviewed = !!(body.type && body.title) // Review not needed if user provided core info

    if (!type || !title) {
      const classification = await classify(body.content)
      type = type ?? classification.type
      title = title ?? classification.title
      tags = tags.length > 0 ? tags : classification.tags
      structured = Object.keys(structured).length > 0 ? structured : classification.structured

      if (categories.length === 0) {
        categories =
          classification.categories.length > 0
            ? classification.categories
            : mapToCategories(type, structured)
      }
      reviewed = false // AI did the heavy lifting, user should review
    }

    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO items (title, type, content, structured, source, source_url, encrypted, reviewed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        title ?? 'Untitled',
        type ?? 'note',
        body.content,
        JSON.stringify(structured),
        body.source,
        body.sourceUrl ?? null,
        body.encrypted ?? false,
        reviewed
      ],
    )

    const itemId = insertResult.rows[0].id

    if (categories.length > 0) {
      await setItemCategories(client, itemId, categories)
    }
    if (tags.length > 0) {
      await setItemTags(client, itemId, tags)
    }

    await client.query('COMMIT')

    const item = await fetchItem(client, itemId)

    if (item) {
      embedItem(item.title, item.content)
        .then((vector) =>
          pool.query('UPDATE items SET embedding = $1 WHERE id = $2', [
            JSON.stringify(vector),
            itemId,
          ]),
        )
        .catch((err) => logger.error(err, `Embedding failed for ${itemId}`))
    }

    res.status(201).json(item)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err, 'POST /api/items error')
    res.status(500).json({ error: 'Failed to create item' })
  } finally {
    client.release()
  }
})

// ... (stats, related, versions, single-fetch routes) ...

// ── PUT /api/items/review-all ────────────────────────────────────────────────

router.put('/review-all', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE items 
       SET reviewed = TRUE, updated_at = NOW() 
       WHERE reviewed = FALSE 
         AND deleted_at IS NULL 
         AND source = 'keep'
         AND structured != '{}'::jsonb`
    )
    res.json({ count: rowCount })
  } catch (err) {
    logger.error(err, 'PUT /api/items/review-all error')
    res.status(500).json({ error: 'Failed to review items' })
  }
})

import { generateInsights } from '../services/insightService.js'
import { getRediscoveryItems } from '../services/rediscoveryService.js'

// ── GET /api/items/insights ──────────────────────────────────────────────────

router.get('/insights', async (_req, res) => {
  try {
    const insights = await generateInsights()
    res.json(insights)
  } catch (err) {
    logger.error(err, 'GET /api/items/insights error')
    res.status(500).json({ error: 'Failed to generate insights' })
  }
})

// ── GET /api/items/rediscover ────────────────────────────────────────────────

router.get('/rediscover', async (_req, res) => {
  try {
    const items = await getRediscoveryItems()
    res.json(items)
  } catch (err) {
    logger.error(err, 'GET /api/items/rediscover error')
    res.status(500).json({ error: 'Failed to fetch rediscovery items' })
  }
})

// ── GET /api/items/stats ───────────────────────────────────────────────────────

// Re-queue all unclassified Keep items through Ollama
router.post('/enrich', async (_req, res) => {
  try {
    const { rows } = await pool.query<{ id: string; title: string; content: string }>(
      `SELECT id, title, content FROM items
       WHERE source = 'keep' AND structured = '{}'::jsonb AND deleted_at IS NULL
       LIMIT 2000`
    )
    if (rows.length === 0) return res.json({ queued: 0 })

    res.json({ queued: rows.length })

    // Fire and forget — individual classify, 3 concurrent, failures stay pending
    const limit = pLimit(3)
    let done = 0
    await Promise.all(rows.map(row => limit(async () => {
      const text = [row.title, row.content].filter(t => t?.trim()).join('\n\n')
      if (!text.trim()) { done++; return; }

      try {
        const result = await classify(text)
        if (!result.title || result.title === 'Untitled') {
          result.title = row.title || row.content.split('\n')[0]?.slice(0, 80) || 'Untitled'
        }

        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const { rows: meta } = await client.query<{ reviewed: boolean }>(
            'SELECT reviewed FROM items WHERE id = $1', [row.id]
          )
          const isReviewed = meta[0]?.reviewed ?? false
          await applyClassificationResult(client, row.id, result, isReviewed)
          await client.query('COMMIT')
          logger.info(`[Re-enrich] OK: ${result.title} → ${result.type}${isReviewed ? ' (extraction only)' : ''}`)
        } catch (err) {
          await client.query('ROLLBACK')
          logger.error(err, `[Re-enrich] DB update failed for ${row.id}`)
        } finally {
          client.release()
        }
      } catch {
        logger.error(`[Re-enrich] Classify failed for ${row.id}, leaving as pending`)
      }

      done++
      if (done % 10 === 0) logger.info(`[Re-enrich] ${done}/${rows.length}`)
    })))
    logger.info(`[Re-enrich] Complete: ${rows.length} items processed`)
  } catch (err) {
    logger.error(err, 'POST /api/items/enrich error')
  }
})

// Items from Keep that still have empty structured data = not yet AI-classified
router.get('/enrichment', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE structured = '{}'::jsonb) AS pending,
        COUNT(*) AS total
      FROM items
      WHERE source = 'keep' AND deleted_at IS NULL
    `)
    res.json({
      pending: parseInt(rows[0].pending, 10),
      total:   parseInt(rows[0].total,   10),
    })
  } catch (err) {
    logger.error(err, 'GET /api/items/enrichment error')
    res.status(500).json({ error: 'Failed to fetch enrichment status' })
  }
})

router.get('/stats', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE structured != '{}'::jsonb)              AS ai_enriched,
        COUNT(*) FILTER (WHERE structured  = '{}'::jsonb)              AS pending_ai,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS recent
      FROM items WHERE deleted_at IS NULL
    `)
    const typeResult = await pool.query('SELECT type, COUNT(*) FROM items WHERE deleted_at IS NULL GROUP BY type')
    const vaultResult = await pool.query('SELECT COUNT(*) FROM vault_items')

    const itemsByType: Record<string, number> = {}
    typeResult.rows.forEach(r => itemsByType[r.type] = parseInt(r.count, 10))

    res.json({
      totalItems:      parseInt(rows[0].total,       10),
      aiEnriched:      parseInt(rows[0].ai_enriched, 10),
      pendingAI:       parseInt(rows[0].pending_ai,  10),
      itemsByType,
      totalVaultItems: parseInt(vaultResult.rows[0].count, 10),
      recentActivity:  parseInt(rows[0].recent,      10),
    })
  } catch (err) {
    logger.error(err, 'GET /api/items/stats error')
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// ── GET /api/items/digest — weekly digest ────────────────────────────────────
// NOTE: must be registered before the parametric '/:id' route below, otherwise
// Express matches '/:id' with id="digest" and fails on the UUID lookup.

router.get('/digest', async (_req, res) => {
  try {
    const digest = await generateDigest()
    res.json(digest)
  } catch (err) {
    logger.error(err, 'GET /api/items/digest error')
    res.status(500).json({ error: 'Failed to generate digest' })
  }
})

router.get('/:id/related', async (req, res) => {
  try {
    const { rows: itemRows } = await pool.query('SELECT embedding FROM items WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
    if (itemRows.length === 0 || !itemRows[0].embedding) return res.json([])
    const embedding = itemRows[0].embedding
    const sql = `
      SELECT
        i.id, i.title, i.type, i.content, i.structured,
        i.source, i.source_url, i.encrypted, i.reviewed, i.created_at, i.updated_at,
        COALESCE((SELECT array_agg(c.name ORDER BY ic2.depth) FROM item_categories ic2 JOIN categories c ON c.id = ic2.category_id WHERE ic2.item_id = i.id), '{}'::text[]) AS categories,
        COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM item_tags it2 JOIN tags t ON t.id = it2.tag_id WHERE it2.item_id = i.id), '{}'::text[]) AS tags
      FROM items i
      WHERE i.id != $1 AND i.deleted_at IS NULL AND i.embedding IS NOT NULL
      ORDER BY i.embedding <=> $2::vector
      LIMIT 5
    `
    const { rows } = await pool.query(sql, [req.params.id, JSON.stringify(embedding)])
    res.json(rows.map(rowToItem))
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch related items' })
  }
})

// ── POST /api/items/reprocess-bulk — re-classify already-enriched items ──────
// Same logic as /enrich but targets structured != '{}'. Applies to unreviewed,
// logs to history-only for reviewed. Returns immediately, processes in background.

router.post('/reprocess-bulk', async (req, res) => {
  try {
    const filterAll = (req.body as Record<string, unknown>)?.filter === 'all'
    const where = filterAll
      ? `structured != '{}'::jsonb AND deleted_at IS NULL`
      : `structured != '{}'::jsonb AND reviewed = FALSE AND deleted_at IS NULL`

    const { rows } = await pool.query<{ id: string; title: string; content: string }>(
      `SELECT id, title, content FROM items WHERE ${where} LIMIT 2000`
    )
    if (rows.length === 0) {
      res.json({ queued: 0 })
      return
    }

    // Create a job record so callers can poll /api/ingest/jobs/:id for status
    const jobId = uuidv4()
    await pool.query(
      `INSERT INTO ingest_jobs (id, status, progress, total, completed) VALUES ($1, 'processing', 0, $2, 0)`,
      [jobId, rows.length]
    )

    res.json({ queued: rows.length, jobId })

    // Background processing — failures are counted and surfaced in the job record
    const limit = pLimit(3)
    let done = 0
    let failed = 0

    await Promise.all(rows.map(row => limit(async () => {
      const text = [row.title, row.content].filter(t => t?.trim()).join('\n\n')
      if (!text.trim()) { done++; return }

      try {
        const result = await classify(text)
        if (!result.title || result.title === 'Untitled') {
          result.title = row.title || row.content.split('\n')[0]?.slice(0, 80) || 'Untitled'
        }

        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const { rows: meta } = await client.query<{ reviewed: boolean }>(
            'SELECT reviewed FROM items WHERE id = $1', [row.id]
          )
          const isReviewed = meta[0]?.reviewed ?? false
          await applyClassificationResult(client, row.id, result, isReviewed)
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK')
          logger.error(err, `[Reprocess] DB update failed for ${row.id}`)
          failed++
        } finally {
          client.release()
        }
      } catch {
        logger.error(`[Reprocess] Classify failed for ${row.id}`)
        failed++
      }

      done++
      const pct = Math.round((done / rows.length) * 100)
      await pool.query(
        'UPDATE ingest_jobs SET completed=$1, progress=$2 WHERE id=$3',
        [done, pct, jobId]
      ).catch(() => {})
    })))

    // Mark job complete; record any failures in the error field
    const errorMsg = failed > 0 ? `${failed} of ${rows.length} items failed (Ollama unavailable or DB error)` : null
    await pool.query(
      `UPDATE ingest_jobs SET status=$1, error=$2, completed_at=NOW() WHERE id=$3`,
      [failed > 0 ? 'failed' : 'completed', errorMsg, jobId]
    ).catch(() => {})

    logger.info(`[Reprocess] Complete: ${rows.length - failed} succeeded, ${failed} failed`)
  } catch (err) {
    logger.error(err, 'POST /api/items/reprocess-bulk error')
  }
})

// ── GET /api/items/:id/extractions ───────────────────────────────────────────

router.get('/:id/extractions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, model, type, title, summary, structured, categories, tags, confidence, applied, created_at
       FROM item_extractions
       WHERE item_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    logger.error(err, 'GET /api/items/:id/extractions error')
    res.status(500).json({ error: 'Failed to fetch extraction history' })
  }
})

// ── POST /api/items/:id/apply-extraction/:extractionId ───────────────────────

router.post('/:id/apply-extraction/:extractionId', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Load extraction
    const { rows: extRows } = await client.query(
      `SELECT * FROM item_extractions WHERE id = $1 AND item_id = $2`,
      [req.params.extractionId, req.params.id]
    )
    if (extRows.length === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Extraction not found' })
      return
    }
    const ext = extRows[0]

    // Apply to item
    await client.query(
      `UPDATE items
       SET type=$1, title=$2, structured=$3, extraction_model=$4, confidence=$5, updated_at=NOW()
       WHERE id=$6`,
      [ext.type, ext.title, JSON.stringify(ext.structured), ext.model, ext.confidence, req.params.id]
    )
    if (ext.tags?.length > 0) await setItemTags(client, req.params.id, ext.tags)
    if (ext.categories?.length > 0) await setItemCategories(client, req.params.id, ext.categories)

    // Update applied flags
    await client.query('UPDATE item_extractions SET applied = FALSE WHERE item_id = $1', [req.params.id])
    await client.query('UPDATE item_extractions SET applied = TRUE  WHERE id = $1', [req.params.extractionId])

    await client.query('COMMIT')

    const updated = await fetchItem(client, req.params.id)
    res.json(updated)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err, 'POST /api/items/:id/apply-extraction error')
    res.status(500).json({ error: 'Failed to apply extraction' })
  } finally {
    client.release()
  }
})

// ── POST /api/items/:id/re-classify — add a new extraction without applying ───
// Always sets applied=false so the user can review and choose to apply.

router.post('/:id/re-classify', async (req, res) => {
  try {
    const { rows: itemRows } = await pool.query<{ title: string; content: string }>(
      'SELECT title, content FROM items WHERE id=$1 AND deleted_at IS NULL',
      [req.params.id]
    )
    if (itemRows.length === 0) {
      res.status(404).json({ error: 'Item not found' })
      return
    }
    const { title, content } = itemRows[0]
    const text = [title, content].filter(t => t?.trim()).join('\n\n')

    const result = await classify(text)
    if (!result.title || result.title === 'Untitled') {
      result.title = title || content.split('\n')[0]?.slice(0, 80) || 'Untitled'
    }

    const structuredWithSummary = { ...result.structured, summary: result.summary }

    const { rows: extRows } = await pool.query<{ id: string }>(
      `INSERT INTO item_extractions
         (item_id, model, type, title, summary, structured, categories, tags, confidence, applied, intent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10)
       RETURNING id`,
      [req.params.id, result.model ?? 'unknown', result.type, result.title, result.summary,
       JSON.stringify(structuredWithSummary), result.categories, result.tags, result.confidence,
       result.intent ?? null]
    )

    const { rows: newExt } = await pool.query(
      `SELECT id, item_id, model, type, title, summary, structured, categories, tags, confidence, applied, intent, created_at
       FROM item_extractions WHERE id=$1`,
      [extRows[0].id]
    )

    res.status(201).json(newExt[0])
  } catch (err) {
    logger.error(err, 'POST /api/items/:id/re-classify error')
    res.status(500).json({ error: 'Re-classification failed' })
  }
})

router.get('/:id/versions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, title, content, created_at as "createdAt" FROM item_versions WHERE item_id = $1 ORDER BY created_at DESC', [req.params.id])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch versions' })
  }
})

router.get('/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    const item = await fetchItem(client, req.params.id)
    if (!item) return res.status(404).json({ error: 'Item not found' })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item' })
  } finally {
    client.release()
  }
})

// ── PUT /api/items/:id ────────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  const parsed = updateItemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { title, content, categories, tags, structured, deleted, reviewed, confidence, remindAt, intent } = parsed.data
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM items WHERE id = $1',
      [req.params.id],
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Item not found' })
      return
    }

    const updates: string[] = []
    const params: unknown[] = []
    let p = 1

    if (title !== undefined) { updates.push(`title = $${p++}`); params.push(title) }
    if (content !== undefined) { updates.push(`content = $${p++}`); params.push(content) }
    if (structured !== undefined) { updates.push(`structured = $${p++}`); params.push(JSON.stringify(structured)) }
    if (reviewed !== undefined) { updates.push(`reviewed = $${p++}`); params.push(reviewed) }
    if (confidence !== undefined) { updates.push(`confidence = $${p++}`); params.push(confidence) }
    if (intent !== undefined) { updates.push(`intent = $${p++}`); params.push(intent) }
    if (remindAt !== undefined) { updates.push(`remind_at = $${p++}`); params.push(remindAt ?? null) }
    if (deleted === false) { updates.push(`deleted_at = NULL`) }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`)
      params.push(req.params.id)
      await client.query(
        `UPDATE items SET ${updates.join(', ')} WHERE id = $${p}`,
        params,
      )
    }

    if (categories !== undefined) {
      await setItemCategories(client, req.params.id, categories)
    }
    if (tags !== undefined) {
      await setItemTags(client, req.params.id, tags)
    }

    // Update entity graph links if structured data changed
    if (structured !== undefined) {
       const updated = await fetchItem(client, req.params.id);
       if (updated) {
          await extractAndLinkEntities(client, req.params.id, updated.type, updated.structured);
       }
    }

    await client.query('COMMIT')

    const item = await fetchItem(client, req.params.id)

    if (content !== undefined && item) {
      embedItem(item.title, item.content)
        .then((vector) =>
          pool.query('UPDATE items SET embedding = $1 WHERE id = $2', [
            JSON.stringify(vector),
            req.params.id,
          ]),
        )
        .catch((err) => logger.error(err, `Re-embed failed for ${req.params.id}`))
    }

    res.json(item)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(err, 'PUT /api/items/:id error')
    res.status(500).json({ error: 'Failed to update item' })
  } finally {
    client.release()
  }
})

// ── DELETE /api/items/bulk (soft delete) ───────────────────────────────────────

router.delete('/bulk', async (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'IDs array required' })
    return
  }
  try {
    const { rowCount } = await pool.query(
      'UPDATE items SET deleted_at = NOW() WHERE id = ANY($1) AND deleted_at IS NULL',
      [ids]
    )
    res.json({ count: rowCount })
  } catch (err) {
    logger.error(err, 'DELETE /api/items/bulk error')
    res.status(500).json({ error: 'Failed to delete items' })
  }
})

// ── DELETE /api/items/:id (soft delete) ───────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE items SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    )
    if (rowCount === 0) {
      res.status(404).json({ error: 'Item not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    logger.error(err, 'DELETE /api/items/:id error')
    res.status(500).json({ error: 'Failed to delete item' })
  }
})


// ── POST /api/items/nl-filter — natural-language query → structured filter → items ──

import { parseNLFilter, SAFE_FIELDS } from '../services/nlFilterService.js'

router.post('/nl-filter', async (req, res) => {
  const { query } = req.body
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' })
  }

  try {
    const parsedFilter = await parseNLFilter(query)

    const conditions: string[] = ['i.deleted_at IS NULL']
    const params: unknown[] = []
    let p = 1

    if (parsedFilter.type) {
      conditions.push(`i.type = $${p++}`)
      params.push(parsedFilter.type)
    }

    if (parsedFilter.searchQuery) {
      conditions.push(`(i.title ILIKE $${p} OR i.content ILIKE $${p})`)
      params.push(`%${parsedFilter.searchQuery}%`)
      p++
    }

    for (const [field, value] of Object.entries(parsedFilter.structuredFilters)) {
      if (!SAFE_FIELDS.has(field)) continue  // explicit route-level guard
      const fi = p++
      const vi = p++
      conditions.push(`jsonb_extract_path_text(i.structured, $${fi}) ILIKE $${vi}`)
      params.push(field)
      params.push(`%${value}%`)
    }

    const where = conditions.join(' AND ')

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM items i WHERE ${where}`,
      params,
    )
    const total = parseInt(countRows[0].total, 10)

    const { rows } = await pool.query(
      ITEM_LIST_SELECT_SQL + `WHERE ${where} ORDER BY i.created_at DESC LIMIT 50`,
      params,
    )

    res.json({ items: rows.map(rowToItem), total, parsedFilter })
  } catch (err) {
    logger.error(err, 'POST /api/items/nl-filter error')
    res.status(500).json({ error: 'NL filter failed' })
  }
})

// ── GET /api/items/reminders/due — items whose reminder has fired ─────────────

router.get('/reminders/due', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        i.id, i.title, i.type, i.content, i.structured,
        i.source, i.source_url, i.encrypted, i.reviewed,
        i.created_at, i.updated_at, i.deleted_at, i.confidence,
        i.intent, i.remind_at, i.public_token, i.share_expires_at,
        COALESCE(
          (SELECT array_agg(c.name ORDER BY ic2.depth)
           FROM item_categories ic2
           JOIN categories c ON c.id = ic2.category_id
           WHERE ic2.item_id = i.id),
          '{}'::text[]
        ) AS categories,
        COALESCE(
          (SELECT array_agg(t.name ORDER BY t.name)
           FROM item_tags it2
           JOIN tags t ON t.id = it2.tag_id
           WHERE it2.item_id = i.id),
          '{}'::text[]
        ) AS tags
      FROM items i
      WHERE i.deleted_at IS NULL
        AND i.remind_at IS NOT NULL
        AND i.remind_at <= NOW()
      ORDER BY i.remind_at ASC
    `)
    res.json(rows.map(rowToItem))
  } catch (err) {
    logger.error(err, 'GET /api/items/reminders/due error')
    res.status(500).json({ error: 'Failed to fetch due reminders' })
  }
})

// ── POST /api/items/:id/share — generate a public share token ────────────────

router.post('/:id/share', async (req, res) => {
  try {
    const token = randomBytes(20).toString('hex')
    const { rowCount, rows } = await pool.query<{ share_expires_at: Date }>(
      `UPDATE items
          SET public_token = $1, share_expires_at = NOW() + INTERVAL '7 days'
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING share_expires_at`,
      [token, req.params.id],
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Item not found' })
    res.json({ token, expiresAt: rows[0].share_expires_at })
  } catch (err) {
    logger.error(err, 'POST /api/items/:id/share error')
    res.status(500).json({ error: 'Failed to generate share token' })
  }
})

// ── DELETE /api/items/:id/share — revoke sharing ──────────────────────────────

router.delete('/:id/share', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE items SET public_token = NULL, share_expires_at = NULL WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Item not found' })
    res.status(204).send()
  } catch (err) {
    logger.error(err, 'DELETE /api/items/:id/share error')
    res.status(500).json({ error: 'Failed to revoke sharing' })
  }
})

// ── GET /api/items/export/obsidian — ZIP of Markdown files with YAML frontmatter ──

function sanitizeFilename(title: string): string {
  return title
    .replace(/[/\\:*?"<>|]/g, '-')   // replace filesystem-unsafe chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'Untitled'
}

function toYamlValue(val: unknown, indent = ''): string {
  if (val === null || val === undefined) return '~'
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    return '\n' + val.map(v => `${indent}  - ${toYamlValue(v)}`).join('\n')
  }
  if (typeof val === 'object') {
    const lines = Object.entries(val as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${indent}  ${k}: ${toYamlValue(v, indent + '  ')}`)
    return lines.length ? '\n' + lines.join('\n') : '{}'
  }
  const str = String(val)
  // Quote if contains colon+space, leading special chars, or newlines
  if (/:\s|^[{[\-#*&!|>'"@`]|[\n\r]/.test(str)) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }
  return str
}

function itemToMarkdown(item: Record<string, unknown>): string {
  const structured = (item.structured as Record<string, unknown>) ?? {}
  const categories = (item.categories as string[]) ?? []
  const tags = (item.tags as string[]) ?? []

  const frontmatter: Record<string, unknown> = {
    title: item.title,
    type: item.type,
    source: item.source,
    ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
    created: item.createdAt,
    reviewed: item.reviewed,
    ...(item.confidence != null ? { confidence: item.confidence } : {}),
    ...(categories.length ? { categories } : {}),
    ...(tags.length ? { tags } : {}),
    // Flatten structured fields (exclude 'summary' — it goes in the body)
    ...Object.fromEntries(
      Object.entries(structured)
        .filter(([k]) => k !== 'summary')
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
    ),
  }

  const yamlLines = Object.entries(frontmatter)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${toYamlValue(v)}`)
    .join('\n')

  const summary = structured.summary ? `> ${structured.summary}\n\n` : ''
  const content = typeof item.content === 'string' ? item.content : ''

  return `---\n${yamlLines}\n---\n\n${summary}${content}`
}

router.get('/export/obsidian', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        i.id, i.title, i.type, i.content, i.structured,
        i.source, i.source_url, i.encrypted, i.reviewed,
        i.created_at, i.updated_at, i.confidence,
        COALESCE(
          (SELECT array_agg(c.name ORDER BY ic2.depth)
           FROM item_categories ic2
           JOIN categories c ON c.id = ic2.category_id
           WHERE ic2.item_id = i.id),
          '{}'::text[]
        ) AS categories,
        COALESCE(
          (SELECT array_agg(t.name ORDER BY t.name)
           FROM item_tags it2
           JOIN tags t ON t.id = it2.tag_id
           WHERE it2.item_id = i.id),
          '{}'::text[]
        ) AS tags
      FROM items i
      WHERE i.deleted_at IS NULL
        AND i.encrypted = FALSE
      ORDER BY i.created_at DESC
    `)

    const zip = new AdmZip()
    const usedFilenames = new Map<string, number>()

    for (const row of rows) {
      const item = {
        id: row.id,
        title: row.title,
        type: row.type,
        content: row.content,
        structured: row.structured,
        source: row.source,
        sourceUrl: row.source_url,
        reviewed: row.reviewed,
        confidence: row.confidence,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        categories: row.categories ?? [],
        tags: row.tags ?? [],
      }

      const baseName = sanitizeFilename(item.title)

      // Deduplicate filenames by appending a counter
      const count = usedFilenames.get(baseName) ?? 0
      usedFilenames.set(baseName, count + 1)
      const filename = count === 0 ? `${baseName}.md` : `${baseName} (${count}).md`

      const markdown = itemToMarkdown(item)
      zip.addFile(filename, Buffer.from(markdown, 'utf8'))
    }

    const zipBuffer = zip.toBuffer()
    const date = new Date().toISOString().split('T')[0]

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="memex-obsidian-${date}.zip"`)
    res.setHeader('Content-Length', zipBuffer.length)
    res.send(zipBuffer)

    logger.info(`[Export] Obsidian vault: ${rows.length} items → ${zipBuffer.length} bytes`)
  } catch (err) {
    logger.error(err, 'GET /api/items/export/obsidian error')
    res.status(500).json({ error: 'Export failed' })
  }
})

export default router
