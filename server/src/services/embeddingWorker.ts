import { pool } from '../db/client.js';
import { embedItem } from './embedder.js';

let isRunning = false;

/**
 * Background worker that finds items with missing embeddings and attempts to generate them.
 */
export async function startEmbeddingWorker() {
  console.log('  -> [Worker] Starting Embedding Retry Worker');
  
  // Run every 60 seconds
  setInterval(async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      // Find items without embeddings (limit to 10 at a time to avoid heavy load)
      const { rows } = await pool.query(
        'SELECT id, title, content FROM items WHERE embedding IS NULL AND deleted_at IS NULL LIMIT 10'
      );

      if (rows.length > 0) {
        console.log(`  -> [Worker] Generating missing embeddings for ${rows.length} items...`);
        
        for (const row of rows) {
          try {
            const vector = await embedItem(row.title, row.content);
            await pool.query('UPDATE items SET embedding = $1 WHERE id = $2', [
              JSON.stringify(vector),
              row.id
            ]);
            console.log(`     OK: ${row.id}`);
          } catch (err) {
            console.error(`     ERR: Failed to embed ${row.id}`, err);
          }
        }
      }
    } catch (err) {
      console.error('  -> [Worker] Database query failed', err);
    } finally {
      isRunning = false;
    }
  }, 60000);
}
