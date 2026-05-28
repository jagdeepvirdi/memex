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
import { classify, classifyBatch, mapToCategories } from '../services/classifier.js'
import { embedItem } from '../services/embedder.js'
import type { ItemType, ItemSource } from '../../../shared/types.js'

const router = Router()

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ITEM_TYPES = ['note', 'recipe', 'media', 'spec', 'stock', 'password', 'link', 'book'] as const
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
})

const listQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  deleted: z.coerce.boolean().default(false),
  unreviewed: z.coerce.boolean().default(false),
  pendingEnrichment: z.coerce.boolean().default(false),
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
}

// ── GET /api/items ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() })
    return
  }

  const { type, category, tag, q, deleted, unreviewed, pendingEnrichment, limit, offset } = parsed.data

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
          i.source, i.source_url, i.encrypted, i.reviewed, i.created_at, i.updated_at, i.deleted_at,
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

    // Fire and forget — process in batches of 5, 2 concurrent batch calls
    const BATCH_SIZE = 5
    const limit = pLimit(2)
    const chunks: typeof rows[] = []
    for (let i = 0; i < rows.length; i += BATCH_SIZE) chunks.push(rows.slice(i, i + BATCH_SIZE))

    let done = 0
    await Promise.all(chunks.map(chunk => limit(async () => {
      let results: Awaited<ReturnType<typeof classifyBatch>>
      try {
        results = await classifyBatch(chunk)
      } catch {
        // Batch failed — fall back to individual classify for each item in chunk
        results = await Promise.all(chunk.map(async row => {
          try {
            const c = await classify(row.title + ' ' + row.content.slice(0, 400))
            return { id: row.id, ...c }
          } catch {
            return { id: row.id, type: 'note' as const, title: row.title, categories: [], tags: [], summary: '', structured: {} }
          }
        }))
      }

      for (const result of results) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query(
            `UPDATE items SET type=$1, title=$2, structured=$3, updated_at=NOW() WHERE id=$4`,
            [result.type, result.title || result.id, JSON.stringify({ ...result.structured, summary: result.summary }), result.id]
          )
          if (result.tags.length > 0) await setItemTags(client, result.id, result.tags)
          if (result.categories.length > 0) await setItemCategories(client, result.id, result.categories)
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK')
          console.error(`Re-enrich DB update failed for ${result.id}:`, err)
        } finally {
          client.release()
        }
      }

      done += chunk.length
      console.log(`[Re-enrich] ${done}/${rows.length} done`)
    })))
    console.log(`[Re-enrich] All ${rows.length} items complete`)
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

  const { title, content, categories, tags, structured, deleted, reviewed } = parsed.data
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
