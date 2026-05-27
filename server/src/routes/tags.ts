import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db/client.js'
import type { Tag } from '../../../shared/types.js'

const router = Router()

// ── GET /api/tags — all tags with item counts ─────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query<{ name: string; item_count: string }>(`
      SELECT t.name, COUNT(DISTINCT it.item_id)::text AS item_count
      FROM tags t
      LEFT JOIN item_tags it ON it.tag_id = t.id
      LEFT JOIN items i ON i.id = it.item_id AND i.deleted_at IS NULL
      GROUP BY t.name
      ORDER BY t.name
    `)

    const tags: Tag[] = rows.map((r) => ({
      name: r.name,
      itemCount: parseInt(r.item_count, 10),
    }))

    res.json(tags)
  } catch (err) {
    console.error('GET /api/tags error:', err)
    res.status(500).json({ error: 'Failed to fetch tags' })
  }
})

// ── POST /api/items/:itemId/tags — add tags to an item ───────────────────────

export function itemTagsHandler(router: Router): void {
  const addSchema = z.object({ tags: z.array(z.string()).min(1) })

  router.post('/:itemId/tags', async (req, res) => {
    const parsed = addSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
      return
    }

    const client = await pool.connect()
    try {
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM items WHERE id = $1 AND deleted_at IS NULL',
        [req.params.itemId],
      )
      if (rows.length === 0) {
        res.status(404).json({ error: 'Item not found' })
        return
      }

      for (const raw of parsed.data.tags) {
        const name = raw.toLowerCase().trim()
        if (!name) continue

        const tagResult = await client.query<{ id: string }>(
          `INSERT INTO tags (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [name],
        )
        await client.query(
          `INSERT INTO item_tags (item_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.params.itemId, tagResult.rows[0].id],
        )
      }

      // Return updated tag list for item
      const { rows: tagRows } = await client.query<{ name: string }>(
        `SELECT t.name FROM item_tags it
         JOIN tags t ON t.id = it.tag_id
         WHERE it.item_id = $1
         ORDER BY t.name`,
        [req.params.itemId],
      )

      res.json(tagRows.map((r) => r.name))
    } catch (err) {
      console.error('POST /api/items/:id/tags error:', err)
      res.status(500).json({ error: 'Failed to add tags' })
    } finally {
      client.release()
    }
  })

  // ── DELETE /api/items/:itemId/tags/:tag ─────────────────────────────────────

  router.delete('/:itemId/tags/:tag', async (req, res) => {
    try {
      const tagName = req.params.tag.toLowerCase().trim()

      const { rows } = await pool.query<{ id: string }>(
        'SELECT id FROM tags WHERE name = $1',
        [tagName],
      )
      if (rows.length === 0) {
        res.status(404).json({ error: 'Tag not found' })
        return
      }

      const { rowCount } = await pool.query(
        'DELETE FROM item_tags WHERE item_id = $1 AND tag_id = $2',
        [req.params.itemId, rows[0].id],
      )

      if (rowCount === 0) {
        res.status(404).json({ error: 'Item does not have this tag' })
        return
      }

      res.status(204).send()
    } catch (err) {
      console.error('DELETE /api/items/:id/tags/:tag error:', err)
      res.status(500).json({ error: 'Failed to remove tag' })
    }
  })
}

export default router
