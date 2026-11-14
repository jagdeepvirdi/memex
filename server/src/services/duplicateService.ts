import { pool } from '../db/client.js'
import type { ItemType } from '../../../shared/types.js'
import { normalizeSourceUrl, sameSourceUrl } from './urlNormalize.js'

// Cosine similarity threshold for flagging near-duplicates.
// 0.92 catches the same article/recipe saved twice while ignoring
// genuinely related but distinct content.
const SIMILARITY_THRESHOLD = 0.92

export interface SimilarItem {
  id: string
  title: string
  type: ItemType
  similarity: number
}

/**
 * Live items whose saved `source_url` is the same page as `url` (see `normalizeSourceUrl`).
 * ILIKE narrows candidates by a host/path/video-id token; the exact comparison happens in JS
 * because the stored spellings vary (youtu.be vs watch?v=, www., tracking params).
 */
export async function findItemsBySourceUrl(url: string, limit = 3): Promise<SimilarItem[]> {
  const key = normalizeSourceUrl(url)
  if (!key) return []

  try {
    const pattern = `%${key.searchKey.replace(/[\\%_]/g, '\\$&')}%`
    const { rows } = await pool.query<{ id: string; title: string; type: ItemType; source_url: string }>(
      `SELECT id, title, type, source_url
       FROM items
       WHERE deleted_at IS NULL
         AND source_url IS NOT NULL
         AND source_url ILIKE $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [pattern],
    )
    return rows
      .filter((r) => sameSourceUrl(r.source_url, url))
      .slice(0, limit)
      .map(({ id, title, type }) => ({ id, title, type, similarity: 1 }))
  } catch {
    // Never block ingestion due to a duplicate-check failure
    return []
  }
}

/** Exact-URL matches first (similarity 1), then embedding matches, de-duplicated by id. */
export function mergeSimilar(...lists: SimilarItem[][]): SimilarItem[] {
  const seen = new Set<string>()
  return lists.flat().filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
}

/**
 * Given a content embedding, returns up to `limit` existing items whose
 * embeddings exceed SIMILARITY_THRESHOLD. Returns [] if the library has
 * no embeddings yet or if Ollama failed to embed.
 */
export async function findSimilarItems(
  embedding: number[],
  limit = 3,
): Promise<SimilarItem[]> {
  if (!embedding || embedding.length === 0) return []

  try {
    const vectorStr = JSON.stringify(embedding)

    const { rows } = await pool.query<SimilarItem & { similarity: number }>(
      `SELECT id, title, type,
              ROUND(((1 - (embedding <=> $1::vector)) * 100)::numeric, 0)::float / 100 AS similarity
       FROM items
       WHERE deleted_at IS NULL
         AND embedding IS NOT NULL
         AND (1 - (embedding <=> $1::vector)) > $2
       ORDER BY similarity DESC
       LIMIT $3`,
      [vectorStr, SIMILARITY_THRESHOLD, limit],
    )

    return rows
  } catch {
    // Never block ingestion due to a duplicate-check failure
    return []
  }
}
