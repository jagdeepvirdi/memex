import { pool } from '../db/client.js'
import { rowToItem } from '../db/helpers.js'
import type { RediscoveryItem } from '../../../shared/types.js'

export async function getRediscoveryItems(): Promise<RediscoveryItem[]> {
  const client = await pool.connect()
  try {
    const results: RediscoveryItem[] = []

    // 1. "On this day" (created same month/day, different year)
    const onThisDaySql = `
      SELECT
        i.id, i.title, i.type, i.content, i.structured,
        i.source, i.source_url, i.encrypted, i.created_at, i.updated_at,
        COALESCE(
          (SELECT array_agg(c.name ORDER BY ic2.depth)
           FROM item_categories ic2
           JOIN categories c ON c.id = ic2.category_id
           WHERE ic2.item_id = i.id),
          '{}'::text[]
        ) AS categories,
        COALESCE(
          (SELECT array_agg(t.name ORDER BY t.name)
           FROM item_tags it2
           JOIN tags t ON t.id = it2.tag_id
           WHERE it2.item_id = i.id),
          '{}'::text[]
        ) AS tags
      FROM items i
      WHERE i.deleted_at IS NULL
        AND EXTRACT(MONTH FROM i.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY FROM i.created_at) = EXTRACT(DAY FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM i.created_at) < EXTRACT(YEAR FROM CURRENT_DATE)
      ORDER BY RANDOM()
      LIMIT 1
    `
    const { rows: onThisDayRows } = await client.query(onThisDaySql)
    
    if (onThisDayRows.length > 0) {
      const item = rowToItem(onThisDayRows[0])
      const yearsAgo = new Date().getFullYear() - new Date(item.createdAt).getFullYear()
      results.push({
        type: 'on-this-day',
        reason: `Saved ${yearsAgo} year${yearsAgo > 1 ? 's' : ''} ago today`,
        item
      })
    }

    // 2. "Random / Forgotten" (older than 30 days, randomly selected)
    const randomSql = `
      SELECT
        i.id, i.title, i.type, i.content, i.structured,
        i.source, i.source_url, i.encrypted, i.created_at, i.updated_at,
        COALESCE(
          (SELECT array_agg(c.name ORDER BY ic2.depth)
           FROM item_categories ic2
           JOIN categories c ON c.id = ic2.category_id
           WHERE ic2.item_id = i.id),
          '{}'::text[]
        ) AS categories,
        COALESCE(
          (SELECT array_agg(t.name ORDER BY t.name)
           FROM item_tags it2
           JOIN tags t ON t.id = it2.tag_id
           WHERE it2.item_id = i.id),
          '{}'::text[]
        ) AS tags
      FROM items i
      WHERE i.deleted_at IS NULL
        AND i.created_at < NOW() - INTERVAL '30 days'
        ${results.length > 0 ? `AND i.id != '${results[0].item.id}'` : ''}
      ORDER BY RANDOM()
      LIMIT ${results.length === 0 ? 2 : 1}
    `
    const { rows: randomRows } = await client.query(randomSql)

    for (const row of randomRows) {
      results.push({
        type: 'random',
        reason: 'Random rediscovery from your archives',
        item: rowToItem(row)
      })
    }

    return results
  } finally {
    client.release()
  }
}
