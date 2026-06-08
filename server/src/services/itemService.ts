import type { PoolClient } from 'pg'
import { setItemCategories, setItemTags } from '../db/helpers.js'
import type { ClassificationResult } from './classifier.js'

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
