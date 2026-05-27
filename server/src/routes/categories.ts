import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db/client.js'
import type { Category } from '../../../shared/types.js'

const router = Router()

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
})

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
})

// ── Row types ─────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string
  name: string
  parent_id: string | null
  item_count: string
}

// ── Build category tree from flat rows ───────────────────────────────────────

function buildTree(rows: CategoryRow[]): Category[] {
  const map = new Map<string, Category>()
  const roots: Category[] = []

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      itemCount: parseInt(row.item_count, 10),
      children: [],
    })
  }

  for (const cat of map.values()) {
    if (cat.parentId === null) {
      roots.push(cat)
    } else {
      const parent = map.get(cat.parentId)
      if (parent) {
        parent.children = parent.children ?? []
        parent.children.push(cat)
      }
    }
  }

  return roots
}

// ── GET /api/categories — full tree with item counts ─────────────────────────

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query<CategoryRow>(`
      SELECT
        c.id,
        c.name,
        c.parent_id,
        COUNT(DISTINCT ic.item_id)::text AS item_count
      FROM categories c
      LEFT JOIN item_categories ic ON ic.category_id = c.id
      LEFT JOIN items i ON i.id = ic.item_id AND i.deleted_at IS NULL
      GROUP BY c.id, c.name, c.parent_id
      ORDER BY c.name
    `)

    res.json(buildTree(rows))
  } catch (err) {
    console.error('GET /api/categories error:', err)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// ── POST /api/categories ──────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const parsed = createCategorySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { name, parentId } = parsed.data

  try {
    // Verify parent exists if provided
    if (parentId) {
      const { rows } = await pool.query('SELECT id FROM categories WHERE id = $1', [parentId])
      if (rows.length === 0) {
        res.status(404).json({ error: 'Parent category not found' })
        return
      }
    }

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING id`,
      [name, parentId ?? null],
    )

    const cat = await pool.query<CategoryRow>(
      `SELECT id, name, parent_id, 0::text AS item_count FROM categories WHERE id = $1`,
      [rows[0].id],
    )

    res.status(201).json({
      id: cat.rows[0].id,
      name: cat.rows[0].name,
      parentId: cat.rows[0].parent_id,
      itemCount: 0,
      children: [],
    } as Category)
  } catch (err) {
    console.error('POST /api/categories error:', err)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// ── PUT /api/categories/:id ───────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  const parsed = updateCategorySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() })
    return
  }

  const { name, parentId } = parsed.data
  if (name === undefined && parentId === undefined) {
    res.status(400).json({ error: 'Nothing to update' })
    return
  }

  try {
    const { rows: existing } = await pool.query<{ id: string }>(
      'SELECT id FROM categories WHERE id = $1',
      [req.params.id],
    )
    if (existing.length === 0) {
      res.status(404).json({ error: 'Category not found' })
      return
    }

    if (parentId && parentId === req.params.id) {
      res.status(400).json({ error: 'A category cannot be its own parent' })
      return
    }

    const updates: string[] = []
    const params: unknown[] = []
    let p = 1

    if (name !== undefined) { updates.push(`name = $${p++}`); params.push(name) }
    if (parentId !== undefined) { updates.push(`parent_id = $${p++}`); params.push(parentId) }

    params.push(req.params.id)
    await pool.query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${p}`,
      params,
    )

    const { rows } = await pool.query<CategoryRow>(
      `SELECT c.id, c.name, c.parent_id,
              COUNT(DISTINCT ic.item_id)::text AS item_count
       FROM categories c
       LEFT JOIN item_categories ic ON ic.category_id = c.id
       LEFT JOIN items i ON i.id = ic.item_id AND i.deleted_at IS NULL
       WHERE c.id = $1
       GROUP BY c.id, c.name, c.parent_id`,
      [req.params.id],
    )

    res.json({
      id: rows[0].id,
      name: rows[0].name,
      parentId: rows[0].parent_id,
      itemCount: parseInt(rows[0].item_count, 10),
    } as Category)
  } catch (err) {
    console.error('PUT /api/categories/:id error:', err)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

// ── DELETE /api/categories/:id ────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    // Refuse if items are assigned to this category
    const { rows: assigned } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM item_categories ic
       JOIN items i ON i.id = ic.item_id
       WHERE ic.category_id = $1 AND i.deleted_at IS NULL`,
      [req.params.id],
    )
    if (parseInt(assigned[0].count, 10) > 0) {
      res.status(409).json({ error: 'Category has assigned items — move them first' })
      return
    }

    // Refuse if it has children
    const { rows: children } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM categories WHERE parent_id = $1`,
      [req.params.id],
    )
    if (parseInt(children[0].count, 10) > 0) {
      res.status(409).json({ error: 'Category has child categories — remove them first' })
      return
    }

    const { rowCount } = await pool.query(
      'DELETE FROM categories WHERE id = $1',
      [req.params.id],
    )
    if (rowCount === 0) {
      res.status(404).json({ error: 'Category not found' })
      return
    }

    res.status(204).send()
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

// ── POST /api/items/:itemId/categories — reassign item's categories ───────────
// Mounted on the items router but defined here for co-location

export function itemCategoriesHandler(router: Router): void {
  router.post('/:itemId/categories', async (req, res) => {
    const schema = z.object({ path: z.array(z.string()).min(1) })
    const parsed = schema.safeParse(req.body)
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

      const { setItemCategories } = await import('../db/helpers.js')
      await client.query('BEGIN')
      await setItemCategories(client, req.params.itemId, parsed.data.path)
      await client.query('COMMIT')

      res.status(204).send()
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('POST /api/items/:id/categories error:', err)
      res.status(500).json({ error: 'Failed to update item categories' })
    } finally {
      client.release()
    }
  })
}

export default router
