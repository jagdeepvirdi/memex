import { pool } from '../db/client.js'

async function resolve() {
  const client = await pool.connect()
  try {
    console.log('--- Starting Entity Resolution ---')
    
    // Find similar pairs (0.92 cosine similarity threshold)
    const mergePairsSql = `
      WITH indexed_entities AS (
        SELECT id, name, type, embedding 
        FROM entities 
        WHERE embedding IS NOT NULL
      )
      SELECT 
        a.id as id1, b.id as id2, 
        a.name as name1, b.name as name2, 
        (1 - (a.embedding <=> b.embedding)) as score
      FROM indexed_entities a
      JOIN indexed_entities b ON a.id < b.id AND a.type = b.type
      WHERE (1 - (a.embedding <=> b.embedding)) > 0.92
    `
    const { rows: pairs } = await client.query(mergePairsSql)
    
    console.log(`Found ${pairs.length} potential duplicate pairs.`)
    
    for (const pair of pairs) {
      console.log(`Merging "${pair.name2}" -> "${pair.name1}" (Score: ${pair.score.toFixed(3)})`)
      await client.query('BEGIN')
      // Re-link items
      await client.query(
        'UPDATE item_entities SET entity_id = $1 WHERE entity_id = $2', 
        [pair.id1, pair.id2]
      ).catch(err => {
         // Ignore unique constraint violations if the item is already linked to the canonical entity
         if (err.code === '23505') {
            return client.query('DELETE FROM item_entities WHERE entity_id = $1', [pair.id2])
         }
         throw err;
      });
      // Delete old entity
      await client.query('DELETE FROM entities WHERE id = $1', [pair.id2])
      await client.query('COMMIT')
    }
    
    console.log('--- Resolution Complete ---')
  } catch (err) {
    console.error('Resolution failed:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

resolve()
