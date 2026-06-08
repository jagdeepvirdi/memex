import type { PoolClient } from 'pg'
import pLimit from 'p-limit'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/client.js'
import { setItemCategories, setItemTags, rowToItem } from '../db/helpers.js'
import { classify, type ClassificationResult } from './classifier.js'
import type { Item, ItemType, ItemSource, ItemIntent } from '../../../shared/types.js'
import logger from '../lib/logger.js'

// ── Row type for list queries ─────────────────────────────────────────────────

export interface ItemRow {
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

export interface ListItemsOptions {
  type?: ItemType
  category?: string
  tag?: string
  q?: string
  deleted?: boolean
  unreviewed?: boolean
  pendingEnrichment?: boolean
  enriched?: boolean
  hasReminder?: boolean
  maxConfidence?: number
  limit: number
  offset: number
}

/**
 * SELECT template for list queries — used by GET /api/items and POST /nl-filter.
 * Append your own WHERE, ORDER BY, LIMIT, and OFFSET.
 * The i.deleted_at column is included so callers can filter on it via WHERE.
 */
export const ITEM_LIST_SELECT_SQL = `
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
`

/**
 * Shared helper to build standard SELECT queries for items, reducing copy-paste risk.
 * It prepends the base select structure and appends any custom clauses.
 */
export function buildItemQuery(clauses?: { where?: string; orderBy?: string; limit?: string; offset?: string }): string {
  let query = ITEM_LIST_SELECT_SQL
  if (clauses?.where) {
    query += ` WHERE ${clauses.where}`
  }
  if (clauses?.orderBy) {
    query += ` ORDER BY ${clauses.orderBy}`
  }
  if (clauses?.limit) {
    query += ` LIMIT ${clauses.limit}`
  }
  if (clauses?.offset) {
    query += ` OFFSET ${clauses.offset}`
  }
  return query
}

/**
 * Writes a classification result to the provenance log and, when the item has
 * not been manually reviewed, applies it to the items row.
 *
 * Callers must wrap this in BEGIN/COMMIT/ROLLBACK — this function does not
 * manage the transaction itself.
 */
export async function applyClassificationResult(
  client: PoolClient,
  itemId: string,
  result: ClassificationResult,
  isReviewed: boolean,
): Promise<void> {
  const structuredWithSummary = { ...result.structured, summary: result.summary }

  await client.query(
    `INSERT INTO item_extractions
       (item_id, model, type, title, summary, structured, categories, tags, confidence, applied, intent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      itemId, result.model ?? 'unknown', result.type, result.title, result.summary,
      JSON.stringify(structuredWithSummary), result.categories, result.tags,
      result.confidence, !isReviewed, result.intent ?? null,
    ],
  )

  if (!isReviewed) {
    await client.query(
      `UPDATE items
       SET type=$1, title=$2, structured=$3, extraction_model=$4,
           updated_at=NOW(), confidence=$5, intent=$6
       WHERE id=$7`,
      [
        result.type, result.title, JSON.stringify(structuredWithSummary),
        result.model ?? 'unknown', result.confidence, result.intent ?? null, itemId,
      ],
    )
    if (result.tags.length > 0) await setItemTags(client, itemId, result.tags)
    if (result.categories.length > 0) await setItemCategories(client, itemId, result.categories)
  }
}

/**
 * Queries the list of items based on filter criteria, returning items, count, limit, and offset.
 */
export async function listItems(options: ListItemsOptions): Promise<{ items: Item[]; total: number }> {
  const { type, category, tag, q, deleted, unreviewed, pendingEnrichment, enriched, hasReminder, maxConfidence, limit, offset } = options

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

  const client = await pool.connect()
  try {
    const countResult = await client.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM items i WHERE ${where}`,
      params,
    )
    const total = parseInt(countResult.rows[0].total, 10)

    const listSql = buildItemQuery({
      where,
      orderBy: 'i.created_at DESC',
      limit: `$${p++}`,
      offset: `$${p++}`
    })
    params.push(limit, offset)

    const { rows } = await client.query<ItemRow>(listSql, params)
    const items = rows.map(rowToItem)

    return { items, total }
  } finally {
    client.release()
  }
}

/**
 * Re-queues all unclassified Keep items through Ollama for background re-enrichment.
 */
export async function enrichItems(): Promise<{ queued: number }> {
  const { rows } = await pool.query<{ id: string; title: string; content: string }>(
    `SELECT id, title, content FROM items
     WHERE source = 'keep' AND structured = '{}'::jsonb AND deleted_at IS NULL
     LIMIT 2000`
  )
  if (rows.length === 0) return { queued: 0 }

  // Fire and forget — individual classify, 3 concurrent, failures stay pending
  const limit = pLimit(3);
  
  (async () => {
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
  })().catch(err => {
    logger.error(err, 'Background enrich items error')
  })

  return { queued: rows.length }
}

/**
 * Re-classifies already-enriched items in the background, updating ingest_jobs record for progress tracking.
 */
export async function reprocessBulkItems(filterAll: boolean): Promise<{ queued: number; jobId?: string }> {
  const where = filterAll
    ? `structured != '{}'::jsonb AND deleted_at IS NULL`
    : `structured != '{}'::jsonb AND reviewed = FALSE AND deleted_at IS NULL`

  const { rows } = await pool.query<{ id: string; title: string; content: string }>(
    `SELECT id, title, content FROM items WHERE ${where} LIMIT 2000`
  )
  if (rows.length === 0) {
    return { queued: 0 }
  }

  const jobId = uuidv4()
  await pool.query(
    `INSERT INTO ingest_jobs (id, status, progress, total, completed) VALUES ($1, 'processing', 0, $2, 0)`,
    [jobId, rows.length]
  )

  // Background processing — failures are counted and surfaced in the job record
  const limit = pLimit(3);
  (async () => {
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
  })().catch(err => {
    logger.error(err, 'Background reprocess bulk items error')
  })

  return { queued: rows.length, jobId }
}

