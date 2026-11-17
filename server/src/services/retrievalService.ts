import { pool } from '../db/client.js'
import logger from '../lib/logger.js'
import { rowToItem } from '../db/helpers.js'
import { embedQuery } from './embedder.js'
import { activeEmbeddingId } from './embeddingService.js'
import type { Item } from '../../../shared/types.js'

export interface RetrieveOptions {
  query: string
  limit: number
  type?: string
  category?: string
  tag?: string
  /** Ask needs context items that actually have a vector; plain search also lists items that only match by keyword. */
  requireVector?: boolean
}

export interface RetrieveResult {
  items: Item[]
  /** false when the ranking is keyword-only (the query could not be embedded, or nothing has a matching vector). */
  semantic: boolean
}

const COLUMNS = `
  i.id, i.title, i.type, i.content, i.structured,
  i.source, i.source_url, i.encrypted, i.created_at, i.updated_at,
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
  ) AS tags`

/**
 * Hybrid search: 70% vector similarity + 30% full-text rank. Only vectors made by the active embedding model count;
 * an item with no such vector scores 0 for the semantic part. (Without the CASE/COALESCE its rank was NULL, and
 * Postgres sorts NULL FIRST in DESC order, so unembedded items outranked every real match.)
 * When the query cannot be embedded, falls back to keyword matching so search never fails for that reason.
 */
export async function retrieveItems(opts: RetrieveOptions): Promise<RetrieveResult> {
  let vector: string | null = null
  try {
    vector = JSON.stringify(await embedQuery(opts.query))
  } catch (err) {
    logger.warn({ err }, 'Query embedding failed, using keyword search')
  }

  if (vector) {
    const items = await run(opts, vector)
    if (items.length > 0 || !opts.requireVector) return { items, semantic: true }
    // Nothing has a vector from the active model yet: keywords can still answer.
  }
  return { items: await run(opts, null), semantic: false }
}

async function run(opts: RetrieveOptions, vector: string | null): Promise<Item[]> {
  const semantic = vector !== null
  const params: unknown[] = []
  const add = (value: unknown): string => {
    params.push(value)
    return `$${params.length}`
  }

  // Semantic mode binds the vector and the active model id; keyword mode binds neither (an unused parameter
  // would leave Postgres unable to infer its type).
  const vec = semantic ? add(vector) : null
  const model = semantic ? add(activeEmbeddingId()) : null
  const q = add(opts.query)

  const fts = `to_tsvector('english', i.title || ' ' || i.content)`
  const ftsRank = `ts_rank_cd(${fts}, plainto_tsquery('english', ${q}))`

  const conditions: string[] = ['i.deleted_at IS NULL']
  if (semantic && opts.requireVector) conditions.push(`i.embedding IS NOT NULL AND i.embedding_model = ${model}`)
  if (!semantic) {
    conditions.push(`(${fts} @@ plainto_tsquery('english', ${q}) OR position(lower(${q}) in lower(i.title)) > 0)`)
  }
  if (opts.type) conditions.push(`i.type = ${add(opts.type)}`)
  if (opts.category) {
    conditions.push(`EXISTS (
      SELECT 1 FROM item_categories ic
      JOIN categories c ON c.id = ic.category_id
      WHERE ic.item_id = i.id AND c.name = ${add(opts.category)}
    )`)
  }
  if (opts.tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM item_tags it
      JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = i.id AND t.name = ${add(opts.tag.toLowerCase().trim())}
    )`)
  }

  const semanticScore = semantic
    ? `CASE WHEN i.embedding IS NOT NULL AND i.embedding_model = ${model}
            THEN 1 - (i.embedding <=> ${vec}::vector) ELSE 0 END`
    : '0'

  const sql = `
    SELECT ${COLUMNS},
      (0.7 * ${semanticScore} + 0.3 * COALESCE(${ftsRank}, 0)) AS rank
    FROM items i
    WHERE ${conditions.join(' AND ')}
    ORDER BY rank DESC
    LIMIT ${add(opts.limit)}
  `

  const { rows } = await pool.query(sql, params)
  return rows.map(rowToItem)
}
