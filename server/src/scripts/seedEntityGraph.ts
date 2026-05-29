import { pool } from '../db/client.js'
import { extractAndLinkEntities } from '../services/entityService.js'

async function seed() {
  const client = await pool.connect()
  try {
    console.log('--- Starting Entity Graph Seeding ---')

    // 1. Fetch all items with structured data
    const { rows: items } = await client.query(`
      SELECT id, type, structured
      FROM items 
      WHERE deleted_at IS NULL
        AND structured != '{}'::jsonb
    `)

    console.log(`Found ${items.length} items to process.`)

    let count = 0
    for (const item of items) {
      await extractAndLinkEntities(client, item.id, item.type, item.structured)
      count++
      if (count % 50 === 0) console.log(`Processed ${count}/${items.length}...`)
    }

    console.log('--- Seeding Complete ---')
    
    // 2. Count results
    const { rows: stats } = await client.query(`
      SELECT 
        (SELECT count(*) FROM entities) as entity_count,
        (SELECT count(*) FROM item_entities) as links_count
    `)
    console.log(`Summary: ${stats[0].entity_count} entities created, ${stats[0].links_count} links established.`)

  } catch (err) {
    console.error('Seeding failed:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
