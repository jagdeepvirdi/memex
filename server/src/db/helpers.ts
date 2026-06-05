import type { PoolClient, QueryResult } from 'pg'
import type { Item, ItemType, ItemSource, ItemIntent, StructuredData } from '../../../shared/types.js'

// ── Row shape returned from items queries ────────────────────────────────────

interface ItemRow {
  id: string
  title: string
  type: ItemType
  content: string
  structured: Record<string, unknown>
  source: ItemSource
  source_url: string | null
  encrypted: boolean
  reviewed: boolean
  created_at: Date
  updated_at: Date
  categories: string[] | null
  tags: string[] | null
  confidence: number | null
  intent: ItemIntent | null
  remind_at: Date | null
  public_token: string | null
  share_expires_at: Date | null
}

/**
 * Maps a snake_case database row to the camelCase Item type.
 */
export function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    content: row.content,
    structured: row.structured as StructuredData,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    encrypted: row.encrypted,
    reviewed: row.reviewed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categories: row.categories || [],
    tags: row.tags || [],
    confidence: row.confidence ?? undefined,
    intent: row.intent ?? undefined,
    remindAt: row.remind_at ?? undefined,
    publicToken: row.public_token ?? undefined,
    shareExpiresAt: row.share_expires_at ?? undefined,
  }
}

/**
 * Resolves a full category path (e.g. ['Food', 'Savory', 'Indian']).
 * Creates missing categories on the fly. Returns the ID of the leaf category.
 */
export async function resolveCategoryPath(
  client: PoolClient,
  path: string[],
): Promise<string[]> {
  const ids: string[] = []
  let parentId: string | null = null

  for (const name of path) {
    let rows: { id: string }[]

    if (parentId === null) {
      // Root category — conflicts on the (name) WHERE parent_id IS NULL partial index
      ;({ rows } = await client.query<{ id: string }>(
        `INSERT INTO categories (name, parent_id)
         VALUES ($1, NULL)
         ON CONFLICT (name) WHERE parent_id IS NULL DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name],
      ))
    } else {
      // Child category — conflicts on the (name, parent_id) WHERE parent_id IS NOT NULL partial index
      ;({ rows } = await client.query<{ id: string }>(
        `INSERT INTO categories (name, parent_id)
         VALUES ($1, $2)
         ON CONFLICT (name, parent_id) WHERE parent_id IS NOT NULL DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name, parentId],
      ))
    }

    parentId = rows[0].id
    ids.push(parentId)
  }

  return ids
}

/**
 * Creates a new item with categories and tags.
 */
export async function createItem(
  client: PoolClient,
  item: {
    title: string
    type: ItemType
    content: string
    structured?: Record<string, unknown>
    source: ItemSource
    sourceUrl?: string
    categories?: string[]
    tags?: string[]
    reviewed?: boolean
    confidence?: number
  },
): Promise<Item> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO items (title, type, content, raw_content, structured, source, source_url, reviewed, confidence)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      item.title,
      item.type,
      item.content,       // $3 used for both content and raw_content
      item.structured || {},
      item.source,
      item.sourceUrl || null,
      item.reviewed ?? false,
      item.confidence ?? null,
    ],
  )
  const id = rows[0].id

  if (item.categories && item.categories.length > 0) {
    await setItemCategories(client, id, item.categories)
  }
  if (item.tags && item.tags.length > 0) {
    await setItemTags(client, id, item.tags)
  }

  const result = await fetchItem(client, id)
  if (!result) throw new Error('Failed to fetch created item')
  return result
}

/**
 * Updates an item's categories. Replaces existing ones.
 */
export async function setItemCategories(
  client: PoolClient,
  itemId: string,
  path: string[],
): Promise<void> {
  // 1. Resolve path to IDs
  const categoryIds = await resolveCategoryPath(client, path)

  // 2. Clear existing
  await client.query('DELETE FROM item_categories WHERE item_id = $1', [itemId])

  // 3. Insert new with depth
  for (let i = 0; i < categoryIds.length; i++) {
    await client.query(
      'INSERT INTO item_categories (item_id, category_id, depth) VALUES ($1, $2, $3)',
      [itemId, categoryIds[i], i],
    )
  }
}

/**
 * Updates an item's tags.
 */
export async function setItemTags(
  client: PoolClient,
  itemId: string,
  tags: string[],
): Promise<void> {
  const normalised = tags.map((t) => t.toLowerCase().trim()).filter(Boolean)

  // 1. Ensure tags exist
  for (const name of normalised) {
    await client.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [
      name,
    ])
  }

  // 2. Clear existing links
  await client.query('DELETE FROM item_tags WHERE item_id = $1', [itemId])

  // 3. Link new
  if (normalised.length > 0) {
    await client.query(
      `INSERT INTO item_tags (item_id, tag_id)
       SELECT $1, id FROM tags WHERE name = ANY($2)`,
      [itemId, normalised],
    )
  }
}

/**
 * Fetches a single item with categories and tags.
 */
export async function fetchItem(client: PoolClient, id: string): Promise<Item | null> {
  const { rows } = await client.query<ItemRow>(ITEM_SELECT_SQL, [id])
  return rows[0] ? rowToItem(rows[0]) : null
}

export const ITEM_SELECT_SQL = `
  SELECT
    i.id, i.title, i.type, i.content, i.structured,
    i.source, i.source_url, i.encrypted, i.reviewed, i.created_at, i.updated_at, i.confidence, i.intent, i.remind_at, i.public_token, i.share_expires_at,
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
  WHERE i.id = $1
    AND i.deleted_at IS NULL
`
