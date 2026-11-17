import { pool } from '../db/client.js';
import { embedAndStoreItem } from './embeddingService.js';
import { embeddingBlockedReason } from './embeddingStatus.js';
import logger from '../lib/logger.js'

let isRunning = false;

const TICK_MS = 60_000;
const BATCH = 10;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

// An item whose embedding failed is not retried every minute forever: each failure doubles its wait (1, 2, 4 ... 60
// minutes). Kept in memory on purpose: a restart gives everything a fresh try. Without this the same ten failing items
// were re-selected on every tick and starved all the others.
const retry = new Map<string, { attempts: number; notBefore: number }>();

/** How long to wait before retrying an item that has failed `attempts` times. */
export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/** For tests. */
export function resetEmbeddingBackoff(): void {
  retry.clear();
  isRunning = false;
}

/**
 * Background worker that finds items with missing embeddings and attempts to generate them. It only fills gaps (new
 * items, items whose first attempt failed); switching models and re-embedding the library is the user-confirmed
 * re-embed job, never this worker.
 */
export async function startEmbeddingWorker() {
  logger.info('Starting Embedding Retry Worker')

  setInterval(async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      // A cloud model that cannot be used (Strict Local Mode, no consent, no key) cannot embed: wait quietly instead of
      // failing every item every minute. Search is on keywords meanwhile.
      if (await embeddingBlockedReason()) return;

      const now = Date.now();
      const waiting = [...retry.entries()].filter(([, r]) => r.notBefore > now).map(([id]) => id);

      // Encrypted items hold ciphertext: nothing useful to embed (and nothing that may leave the machine).
      const { rows } = await pool.query(
        `SELECT id, title, content FROM items
         WHERE embedding IS NULL AND embedding_skip IS NULL AND deleted_at IS NULL AND encrypted = false
           AND NOT (id = ANY($1::uuid[]))
         LIMIT ${BATCH}`,
        [waiting],
      );

      if (rows.length > 0) {
        logger.info(`Generating missing embeddings for ${rows.length} items`)

        for (const row of rows) {
          const outcome = await embedAndStoreItem(row);
          if (outcome === 'failed') {
            const attempts = (retry.get(row.id)?.attempts ?? 0) + 1;
            retry.set(row.id, { attempts, notBefore: Date.now() + backoffMs(attempts) });
          } else {
            retry.delete(row.id);
            if (outcome === 'embedded') logger.info({ id: row.id }, 'Embedding generated')
          }
        }
      }
    } catch (err) {
      logger.error(err, 'Embedding worker DB query failed')
    } finally {
      isRunning = false;
    }
  }, TICK_MS);
}
