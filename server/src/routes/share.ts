import { Router } from 'express'
import { pool } from '../db/client.js'
import { rowToItem } from '../db/helpers.js'

const router = Router()

// ── GET /api/share/:token — public, unauthenticated item read ─────────────────

router.get('/:token', async (req, res) => {
  const { token } = req.params
  if (!token || token.length < 10) {
    return res.status(400).json({ error: 'Invalid token' })
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         i.id, i.title, i.type, i.content, i.structured,
         i.source, i.source_url, i.encrypted, i.reviewed,
         i.created_at, i.updated_at, i.confidence, i.remind_at,
         i.public_token,
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
       WHERE i.public_token = $1
         AND i.deleted_at IS NULL
         AND i.encrypted = FALSE`,
      [token],
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found or sharing has been revoked' })
    }

    res.json(rowToItem(rows[0]))
  } catch (err) {
    console.error('GET /api/share/:token error:', err)
    res.status(500).json({ error: 'Failed to fetch shared item' })
  }
})

export default router
