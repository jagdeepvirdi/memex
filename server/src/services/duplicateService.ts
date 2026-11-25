import { createHash } from 'node:crypto'
import { pool } from '../db/client.js'
import { activeEmbeddingId } from './embeddingService.js'
import { activeProfile } from './embeddingProfiles.js'
import type { ItemType } from '../../../shared/types.js'
import { normalizeSourceUrl, sameSourceUrl, isBareLinkTo } from './urlNormalize.js'

// The similarity threshold for flagging near-duplicates comes from the active embedding model's profile
// (embeddingProfiles.ts): a cosine score means different things in different models. For nomic-embed-text it is 0.92,
// which catches the same article/recipe saved twice while ignoring related but distinct content.

export interface SimilarItem {
  id: string
  title: string
  type: ItemType
  similarity: number
}

/** Content longer than this is never "just a link", so the legacy lookup skips it in SQL. */
const LEGACY_CONTENT_MAX_CHARS = 600

/**
 * Live items that are the same page as `url` (see `normalizeSourceUrl`):
 *  1. items whose saved `source_url` matches; and
 *  2. older items with NO `source_url` whose content is essentially just that link (Keep imports, pasted links,
 *     bookmarks — most of an early library). A long note that only mentions the link is not a match.
 * ILIKE narrows candidates by a host/path/video-id token; the exact comparison happens in JS because the
 * stored spellings vary (youtu.be vs watch?v=, www., tracking params). `source_url` matches come first.
 */
export async function findItemsBySourceUrl(url: string, limit = 3): Promise<SimilarItem[]> {
  const key = normalizeSourceUrl(url)
  if (!key) return []

  try {
    const pattern = `%${key.searchKey.replace(/[\\%_]/g, '\\$&')}%`
    const { rows } = await pool.query<{ id: string; title: string; type: ItemType; source_url: string | null; content?: string }>(
      `SELECT id, title, type, source_url, content
       FROM items
       WHERE deleted_at IS NULL
         AND (
           (source_url IS NOT NULL AND source_url ILIKE $1)
           OR (source_url IS NULL AND encrypted = false AND type <> 'password'
               AND length(content) <= ${LEGACY_CONTENT_MAX_CHARS} AND content ILIKE $1)
         )
       ORDER BY (source_url IS NULL), created_at DESC
       LIMIT 50`,
      [pattern],
    )
    return rows
      .filter((r) => (r.source_url ? sameSourceUrl(r.source_url, url) : isBareLinkTo(r.content ?? '', url)))
      .slice(0, limit)
      .map(({ id, title, type }) => ({ id, title, type, similarity: 1 }))
  } catch {
    // Never block ingestion due to a duplicate-check failure
    return []
  }
}

/** Shortest note (after whitespace is collapsed) worth matching word for word; a one-word note saved twice is not news. */
const EXACT_TEXT_MIN_CHARS = 12

/** The text with runs of whitespace collapsed and the ends trimmed: what "the same note" means here. */
export function normalizeNoteText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Live notes whose text is exactly this text (spaces and line breaks ignored). It needs no embedding, so it still finds a
 * note saved a moment ago that the background worker has not embedded yet. That is what protects a phone retry: if the
 * first send was saved but its answer was lost, sending again finds it instead of saving a second copy. Vault and
 * password items are never matched. Never throws.
 */
export async function findItemsByExactText(text: string, limit = 3): Promise<SimilarItem[]> {
  const normalized = normalizeNoteText(text ?? '')
  if (normalized.length < EXACT_TEXT_MIN_CHARS) return []
  try {
    const digest = createHash('md5').update(normalized, 'utf8').digest('hex')
    const { rows } = await pool.query<{ id: string; title: string; type: ItemType }>(
      `SELECT id, title, type
       FROM items
       WHERE deleted_at IS NULL AND encrypted = false AND type <> 'password'
         AND md5(btrim(regexp_replace(content, '\\s+', ' ', 'g'))) = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [digest, limit],
    )
    return (rows ?? []).map(({ id, title, type }) => ({ id, title, type, similarity: 1 }))
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
 * embeddings exceed the active model's duplicate threshold. Returns [] if the library has
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
         AND embedding_model = $4
         AND (1 - (embedding <=> $1::vector)) > $2
       ORDER BY similarity DESC
       LIMIT $3`,
      [vectorStr, activeProfile().duplicate, limit, activeEmbeddingId()],
    )

    return rows
  } catch {
    // Never block ingestion due to a duplicate-check failure
    return []
  }
}
