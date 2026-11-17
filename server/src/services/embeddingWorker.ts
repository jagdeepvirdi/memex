import { pool } from '../db/client.js';
import { embedAndStoreItem } from './embeddingService.js';
import logger from '../lib/logger.js'

let isRunning = false;

/**
 * Background worker that finds items with missing embeddings and attempts to generate them.
 */
export async function startEmbeddingWorker() {
  logger.info('Starting Embedding Retry Worker')
  
  // Run every 60 seconds
  setInterval(async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      // Find items without embeddings (limit to 10 at a time to avoid heavy load)
      const { rows } = await pool.query(
        'SELECT id, title, content FROM items WHERE embedding IS NULL AND embedding_skip IS NULL AND deleted_at IS NULL LIMIT 10'
      );

      if (rows.length > 0) {
        logger.info(`Generating missing embeddings for ${rows.length} items`)
        
        for (const row of rows) {
          const outcome = await embedAndStoreItem(row);
          if (outcome === 'embedded') logger.info({ id: row.id }, 'Embedding generated')
        }
      }
    } catch (err) {
      logger.error(err, 'Embedding worker DB query failed')
    } finally {
      isRunning = false;
    }
  }, 60000);
}
