import { PoolClient } from 'pg'
import { embedQuery } from './embedder.js'
import type { Entity, EntityType, ItemType } from '../../../shared/types.js'

/**
 * Finds an entity by exact name/type or creates it.
 */
export async function getOrCreateEntity(
  client: PoolClient,
  name: string,
  type: EntityType
): Promise<Entity> {
  const normalized = name.trim();
  if (!normalized) throw new Error('Entity name cannot be empty');

  // 1. Try to find existing
  const { rows } = await client.query(
    'SELECT * FROM entities WHERE name = $1 AND type = $2',
    [normalized, type]
  );

  if (rows.length > 0) return rows[0];

  // 2. Not found, create it with embedding for later resolution
  let embedding: number[] | null = null;
  try {
    embedding = await embedQuery(normalized);
  } catch (err) {
    console.warn(`[Entity] Failed to embed "${normalized}":`, err);
  }

  const { rows: newRows } = await client.query(
    `INSERT INTO entities (name, type, embedding)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [normalized, type, embedding ? JSON.stringify(embedding) : null]
  );

  return newRows[0];
}

/**
 * Links an item to an entity with a specific role.
 */
export async function linkItemToEntity(
  client: PoolClient,
  itemId: string,
  entityId: string,
  role: string
): Promise<void> {
  await client.query(
    `INSERT INTO item_entities (item_id, entity_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (item_id, entity_id, role) DO NOTHING`,
    [itemId, entityId, role]
  );
}

/**
 * Automatically extracts and links entities from an item's structured data.
 */
export async function extractAndLinkEntities(
  client: PoolClient,
  itemId: string,
  type: ItemType,
  structured: any
): Promise<void> {
  if (!structured) return;

  try {
    if (type === 'media') {
      if (structured.director) {
        const ent = await getOrCreateEntity(client, structured.director, 'person');
        await linkItemToEntity(client, itemId, ent.id, 'director');
      }
      if (Array.isArray(structured.cast)) {
        for (const actor of structured.cast) {
          const ent = await getOrCreateEntity(client, actor, 'person');
          await linkItemToEntity(client, itemId, ent.id, 'cast');
        }
      }
    }

    if (type === 'book') {
      if (structured.author) {
        const ent = await getOrCreateEntity(client, structured.author, 'person');
        await linkItemToEntity(client, itemId, ent.id, 'author');
      }
    }

    if (type === 'place') {
      if (structured.city) {
        const ent = await getOrCreateEntity(client, structured.city, 'place');
        await linkItemToEntity(client, itemId, ent.id, 'city');
      }
      if (structured.country) {
        const ent = await getOrCreateEntity(client, structured.country, 'place');
        await linkItemToEntity(client, itemId, ent.id, 'country');
      }
      // The place itself can be an entity if we wanted to link OTHER things to it
      // but for now let's focus on the metadata.
    }

    if (type === 'stock') {
       if (structured.exchange) {
          const ent = await getOrCreateEntity(client, structured.exchange, 'organization');
          await linkItemToEntity(client, itemId, ent.id, 'exchange');
       }
    }
  } catch (err) {
    console.error(`[Entity] Extraction failed for item ${itemId}:`, err);
  }
}
