import { PoolClient } from 'pg'
import { embedQuery } from './embedder.js'
import { activeEmbedding, activeEmbeddingId } from './embeddingConfig.js'
import type { Entity, EntityType, ItemType, StructuredData, MediaData, BookData, PlaceData, StockData } from '../../../shared/types.js'
import logger from '../lib/logger.js'
import { repoSlugFromStructured } from './githubRepo.js'

/**
 * Finds an entity by exact name/type or creates it.
 */
export async function getOrCreateEntity(
  client: PoolClient,
  name: string,
  type: EntityType,
  opts: { embed?: boolean } = {},
): Promise<Entity> {
  const normalized = name.trim();
  if (!normalized) throw new Error('Entity name cannot be empty');

  // 1. Try to find existing
  const { rows } = await client.query(
    'SELECT * FROM entities WHERE name = $1 AND type = $2',
    [normalized, type]
  );

  if (rows.length > 0) return rows[0];

  // 2. Not found, create it with embedding for later resolution. Identifiers (repo slugs, handles,
  // channel names) pass embed:false: they are exact, and a NULL embedding keeps resolveEntities.ts from
  // fuzzy-merging e.g. "anthropics/claude-code" into a similarly-named repo.
  // A cloud embedding model never sees entity names: an entity does not know whether the item it came from was private,
  // and names are only used for fuzzy merging, which is same-model and local-only anyway.
  let embedding: number[] | null = null;
  if (opts.embed !== false && activeEmbedding().provider === 'ollama') {
    try {
      embedding = await embedQuery(normalized);
    } catch (err) {
      logger.warn({ err }, `Entity embed failed for "${normalized}"`)
    }
  }

  // ON CONFLICT: two items created concurrently (bulk import) may both miss the SELECT above; the loser
  // must get the winner's row, not a unique violation that would abort the surrounding transaction.
  const { rows: newRows } = await client.query(
    `INSERT INTO entities (name, type, embedding, embedding_model)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name, type) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [normalized, type, embedding ? JSON.stringify(embedding) : null, embedding ? activeEmbeddingId() : null]
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

// ── Developer-knowledge entities (repos, creators, owners, YouTube channels) ──────────────────

const DEV_KINDS = new Set(['repo', 'prompt', 'skill', 'explainer', 'tool'])
const OWNER_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/
const HANDLE = /^[A-Za-z0-9._]{1,30}$/

/** Link roles managed from developer-knowledge / video data; re-linking replaces all of them. */
export const DEV_LINK_ROLES = ['repo', 'owner', 'creator', 'channel'] as const

export interface DevEntityRefs {
  /** Canonical `owner/repo`, lower-cased (GitHub treats case as insignificant). */
  repo?: string
  /** GitHub owner login, lower-cased. */
  owner?: string
  /** Poster handle as `@handle`, lower-cased. */
  creator?: string
  /** YouTube channel display name. */
  channel?: string
}

/** True when structured data carries developer-knowledge (`kind`) or YouTube (`videoId`) markers. */
export function hasDevMarkers(s: Record<string, unknown>): boolean {
  return (typeof s.kind === 'string' && DEV_KINDS.has(s.kind)) || typeof s.videoId === 'string'
}

/**
 * Pulls the linkable identities out of structured data, validating each: model output is untrusted, and a
 * junk "repo" or "handle" must not become a graph node. Keyed on `structured.kind` / `videoId`, not on
 * item type (these items are type `link`).
 */
export function devEntityRefs(s: Record<string, unknown>): DevEntityRefs {
  const refs: DevEntityRefs = {}
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const isDev = typeof s.kind === 'string' && DEV_KINDS.has(s.kind)

  if (isDev) {
    const repo = repoSlugFromStructured(s)
    if (repo) {
      refs.repo = repo
      refs.owner = repo.split('/')[0]
    } else if (OWNER_NAME.test(str(s.owner))) {
      refs.owner = str(s.owner).toLowerCase()
    }

    const handle = str(s.creatorHandle).replace(/^@/, '')
    if (HANDLE.test(handle)) refs.creator = `@${handle.toLowerCase()}`
  }

  if (typeof s.videoId === 'string') {
    const channel = str(s.channel)
    if (channel && channel.length <= 100) refs.channel = channel
  }
  return refs
}

async function linkDevEntities(client: PoolClient, itemId: string, s: Record<string, unknown>): Promise<void> {
  // Replace, don't accumulate: a re-classify that finds a different creator must not leave the old link.
  await client.query(
    'DELETE FROM item_entities WHERE item_id = $1 AND role = ANY($2::text[])',
    [itemId, [...DEV_LINK_ROLES]],
  )
  const refs = devEntityRefs(s)
  const plan: Array<[string | undefined, EntityType, (typeof DEV_LINK_ROLES)[number]]> = [
    [refs.repo, 'other', 'repo'],
    [refs.owner, 'organization', 'owner'],
    [refs.creator, 'person', 'creator'],
    [refs.channel, 'organization', 'channel'],
  ]
  for (const [name, type, role] of plan) {
    if (!name) continue
    const ent = await getOrCreateEntity(client, name, type, { embed: false })
    await linkItemToEntity(client, itemId, ent.id, role)
  }
}

/**
 * Automatically extracts and links entities from an item's structured data.
 */
export async function extractAndLinkEntities(
  client: PoolClient,
  itemId: string,
  type: ItemType,
  structured: StructuredData | null | undefined
): Promise<void> {
  if (!structured) return;

  try {
    if (type === 'media') {
      const s = structured as MediaData
      if (s.director) {
        const ent = await getOrCreateEntity(client, s.director, 'person');
        await linkItemToEntity(client, itemId, ent.id, 'director');
      }
      if (Array.isArray(s.cast)) {
        for (const actor of s.cast) {
          const ent = await getOrCreateEntity(client, actor, 'person');
          await linkItemToEntity(client, itemId, ent.id, 'cast');
        }
      }
    }

    if (type === 'book') {
      const s = structured as BookData
      if (s.author) {
        const ent = await getOrCreateEntity(client, s.author, 'person');
        await linkItemToEntity(client, itemId, ent.id, 'author');
      }
    }

    if (type === 'place') {
      const s = structured as PlaceData
      if (s.city) {
        const ent = await getOrCreateEntity(client, s.city, 'place');
        await linkItemToEntity(client, itemId, ent.id, 'city');
      }
      if (s.country) {
        const ent = await getOrCreateEntity(client, s.country, 'place');
        await linkItemToEntity(client, itemId, ent.id, 'country');
      }
    }

    if (type === 'stock') {
      const s = structured as StockData
      if (s.exchange) {
        const ent = await getOrCreateEntity(client, s.exchange, 'organization');
        await linkItemToEntity(client, itemId, ent.id, 'exchange');
      }
    }

    // Repos / prompts / skills / explainers / tools and YouTube videos (type 'link'): keyed on markers.
    const dev = structured as Record<string, unknown>
    if (hasDevMarkers(dev)) await linkDevEntities(client, itemId, dev)
  } catch (err) {
    logger.error(err, `Entity extraction failed for item ${itemId}`)
  }
}
