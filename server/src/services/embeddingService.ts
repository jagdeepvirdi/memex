import { pool } from '../db/client.js'
import logger from '../lib/logger.js'
import { activeEmbedding, type ActiveEmbedding } from './embeddingConfig.js'
import { embedItem, buildEmbedText } from './embedder.js'
import { cloudSafe, type CloudSafeItem } from './cloudSafe.js'

// One place decides which embedding model is active and writes vectors. Every vector is stored with the model that
// made it (`items.embedding_model`), and every similarity query filters to the active model, because two models'
// 768-dim vectors compare without any error and give meaningless scores.

export { activeEmbedding, activeEmbeddingId, type ActiveEmbedding, type EmbeddingProvider } from './embeddingConfig.js'

/** A local model may embed anything. A cloud model only sees items that pass the privacy guard. */
export function embeddingAllowed(active: ActiveEmbedding, item: CloudSafeItem): boolean {
  return active.provider === 'ollama' || cloudSafe(item)
}

export type EmbedOutcome = 'embedded' | 'skipped' | 'failed'

export interface EmbedResult {
  outcome: EmbedOutcome
  /** Why it failed (outcome 'failed' only), so a batch job can stop on a blocked provider or a bad key. */
  error?: unknown
}

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
 * The single writer of `items.embedding`. Never throws: a failed embed leaves the item as it was and returns the
 * error; a private item under a cloud model is marked `embedding_skip = 'private'` and never sent. Any older vector
 * is kept (it belongs to another model, so searches ignore it), which is what makes switching back instant.
 */
export async function embedAndStoreItemDetailed(
  item: { id: string; title: string; content: string },
  active: ActiveEmbedding = activeEmbedding(),
  signal?: AbortSignal,
): Promise<EmbedResult> {
  try {
    // A cloud model also never sees text that looks sensitive: the gate reads exactly what would be sent.
    if (active.provider !== 'ollama' && !embeddingAllowed(active, { ...(await loadPrivacyInfo(item.id)), content: buildEmbedText(item.title, item.content) })) {
      await pool.query(`UPDATE items SET embedding_skip = 'private' WHERE id = $1`, [item.id])
      return { outcome: 'skipped' }
    }
    const vector = await embedItem(item.title, item.content, signal)
    await pool.query(
      'UPDATE items SET embedding = $1, embedding_model = $2, embedding_skip = NULL WHERE id = $3',
      [JSON.stringify(vector), active.id, item.id],
    )
    return { outcome: 'embedded' }
  } catch (err) {
    if (!signal?.aborted) logger.error(err, `Embedding failed for ${item.id}`)
    return { outcome: 'failed', error: err }
  }
}

/** Same as the detailed form, for callers that only care what happened. */
export async function embedAndStoreItem(
  item: { id: string; title: string; content: string },
  active: ActiveEmbedding = activeEmbedding(),
): Promise<EmbedOutcome> {
  return (await embedAndStoreItemDetailed(item, active)).outcome
}

/** Tags or categories changed on a skipped item: it may no longer be private, so let it be looked at again. */
export async function clearEmbeddingSkip(itemId: string): Promise<void> {
  try {
    await pool.query('UPDATE items SET embedding_skip = NULL WHERE id = $1 AND embedding_skip IS NOT NULL', [itemId])
  } catch (err) {
    logger.error(err, `Clearing embedding skip failed for ${itemId}`)
  }
}
