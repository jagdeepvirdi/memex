import { pool } from '../db/client.js'
import logger from '../lib/logger.js'
import { OLLAMA_EMBED_MODEL } from '../lib/embeddingModel.js'
import { embedItem } from './embedder.js'
import { cloudSafe, type CloudSafeItem } from './cloudSafe.js'

// One place decides which embedding model is active and writes vectors. Every vector is stored with the model that
// made it (`items.embedding_model`), and every similarity query filters to the active model, because two models'
// 768-dim vectors compare without any error and give meaningless scores.

export type EmbeddingProvider = 'ollama' | 'gemini' | 'openai'

export interface ActiveEmbedding {
  provider: EmbeddingProvider
  model: string
  /** '<provider>:<model>', the value stored in `embedding_model` columns. */
  id: string
}

/** The embedding model currently in use. Phase A: always local Ollama; cloud providers arrive with the settings. */
export function activeEmbedding(): ActiveEmbedding {
  return { provider: 'ollama', model: OLLAMA_EMBED_MODEL, id: `ollama:${OLLAMA_EMBED_MODEL}` }
}

export function activeEmbeddingId(): string {
  return activeEmbedding().id
}

/** A local model may embed anything. A cloud model only sees items that pass the privacy guard. */
export function embeddingAllowed(active: ActiveEmbedding, item: CloudSafeItem): boolean {
  return active.provider === 'ollama' || cloudSafe(item)
}

export type EmbedOutcome = 'embedded' | 'skipped' | 'failed'

/** Reads what the privacy guard needs. Only called when the active model is a cloud one. */
async function loadPrivacyInfo(itemId: string): Promise<CloudSafeItem> {
  const { rows } = await pool.query<{ type: string; encrypted: boolean; categories: string[] | null; tags: string[] | null }>(
    `SELECT i.type, i.encrypted,
            (SELECT array_agg(c.name ORDER BY ic.depth) FROM item_categories ic JOIN categories c ON c.id = ic.category_id WHERE ic.item_id = i.id) AS categories,
            (SELECT array_agg(t.name) FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id) AS tags
     FROM items i WHERE i.id = $1`,
    [itemId],
  )
  return rows[0] ?? { encrypted: true } // an item we cannot read is treated as private
}

/**
 * The single writer of `items.embedding`. Never throws: a failed embed leaves the vector empty and the background
 * worker retries it; a private item under a cloud model is marked `embedding_skip = 'private'` and never retried.
 */
export async function embedAndStoreItem(
  item: { id: string; title: string; content: string },
  active: ActiveEmbedding = activeEmbedding(),
): Promise<EmbedOutcome> {
  try {
    if (active.provider !== 'ollama' && !embeddingAllowed(active, await loadPrivacyInfo(item.id))) {
      await pool.query(
        `UPDATE items SET embedding = NULL, embedding_model = NULL, embedding_skip = 'private' WHERE id = $1`,
        [item.id],
      )
      return 'skipped'
    }
    const vector = await embedItem(item.title, item.content)
    await pool.query(
      'UPDATE items SET embedding = $1, embedding_model = $2, embedding_skip = NULL WHERE id = $3',
      [JSON.stringify(vector), active.id, item.id],
    )
    return 'embedded'
  } catch (err) {
    logger.error(err, `Embedding failed for ${item.id}`)
    return 'failed'
  }
}

/**
 * Tags or categories changed on an item that has no vector: it may no longer be private, so let the worker look again.
 * Items that already have a vector are untouched.
 */
export async function clearEmbeddingSkip(itemId: string): Promise<void> {
  try {
    await pool.query('UPDATE items SET embedding_skip = NULL WHERE id = $1 AND embedding IS NULL', [itemId])
  } catch (err) {
    logger.error(err, `Clearing embedding skip failed for ${itemId}`)
  }
}
