import { Router } from 'express'
import { z } from 'zod'
import pLimit from 'p-limit'
import { pool } from '../db/client.js'
import {
  fetchItem,
  setItemCategories,
  setItemTags,
  ITEM_SELECT_SQL,
  rowToItem,
} from '../db/helpers.js'
import { classify, mapToCategories } from '../services/classifier.js'
import { embedItem } from '../services/embedder.js'
import { extractAndLinkEntities } from '../services/entityService.js'
import type { ItemType, ItemSource } from '../../../shared/types.js'

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
}

// ── GET /api/items ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() })
    return
  }

  const { type, category, tag, q, deleted, unreviewed, pendingEnrichment, enriched, limit, offset } = parsed.data

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

      const listSql = `
        SELECT
          i.id, i.title, i.type, i.content, i.structured,
          i.source, i.source_url, i.encrypted, i.reviewed, i.created_at, i.updated_at, i.deleted_at, i.confidence,
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
    console.error('GET /api/items error:', err)
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
        .catch((err) => console.error('Embedding failed for', itemId, err))
    }

    res.status(201).json(item)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('POST /api/items error:', err)
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
    console.error('PUT /api/items/review-all error:', err)
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
    console.error('GET /api/items/insights error:', err)
    res.status(500).json({ error: 'Failed to generate insights' })
  }
})

// ── GET /api/items/rediscover ────────────────────────────────────────────────

router.get('/rediscover', async (_req, res) => {
  try {
    const items = await getRediscoveryItems()
    res.json(items)
  } catch (err) {
    console.error('GET /api/items/rediscover error:', err)
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

          // Check reviewed status — protect manually-confirmed items from auto-overwrite
          const { rows: meta } = await client.query<{ reviewed: boolean }>(
            'SELECT reviewed FROM items WHERE id = $1', [row.id]
          )
          const isReviewed = meta[0]?.reviewed ?? false
          const structuredWithSummary = { ...result.structured, summary: result.summary }

          // Always write to provenance log
          await client.query(
            `INSERT INTO item_extractions
               (item_id, model, type, title, summary, structured, categories, tags, confidence, applied)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [row.id, result.model ?? 'unknown', result.type, result.title, result.summary,
             JSON.stringify(structuredWithSummary), result.categories, result.tags,
             result.confidence, !isReviewed]
          )

          if (!isReviewed) {
            await client.query(
              `UPDATE items SET type=$1, title=$2, structured=$3, extraction_model=$4, updated_at=NOW(), confidence=$5 WHERE id=$6`,
              [result.type, result.title, JSON.stringify(structuredWithSummary),
               result.model ?? 'unknown', result.confidence, row.id]
            )
            if (result.tags.length > 0) await setItemTags(client, row.id, result.tags)
            if (result.categories.length > 0) await setItemCategories(client, row.id, result.categories)
          }

          await client.query('COMMIT')
          console.log(`[Re-enrich] OK: ${result.title} → ${result.type}${isReviewed ? ' (extraction only)' : ''}`)
        } catch (err) {
          await client.query('ROLLBACK')
          console.error(`[Re-enrich] DB update failed for ${row.id}:`, err)
        } finally {
          client.release()
        }
      } catch {
        console.error(`[Re-enrich] Classify failed for ${row.id}, leaving as pending`)
      }

      done++
      if (done % 10 === 0) console.log(`[Re-enrich] ${done}/${rows.length}`)
    })))
    console.log(`[Re-enrich] Complete: ${rows.length} items processed`)
  } catch (err) {
    console.error('POST /api/items/enrich error:', err)
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
    console.error('GET /api/items/enrichment error:', err)
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
    console.error('GET /api/items/stats error:', err)
    res.status(500).json({ error: 'Failed to fetch stats' })
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
    console.error('GET /api/items/:id/extractions error:', err)
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
    console.error('POST /api/items/:id/apply-extraction error:', err)
    res.status(500).json({ error: 'Failed to apply extraction' })
  } finally {
    client.release()
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

  const { title, content, categories, tags, structured, deleted, reviewed, confidence } = parsed.data
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
        .catch((err) => console.error('Re-embed failed for', req.params.id, err))
    }

    res.json(item)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('PUT /api/items/:id error:', err)
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
    console.error('DELETE /api/items/bulk error:', err)
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
    console.error('DELETE /api/items/:id error:', err)
    res.status(500).json({ error: 'Failed to delete item' })
  }
})

export default router
