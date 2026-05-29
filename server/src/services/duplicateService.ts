import { pool } from '../db/client.js'
import type { ItemType } from '../../../shared/types.js'

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
