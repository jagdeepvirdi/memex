import type { Pool, PoolClient } from 'pg'
import { pool } from '../db/client.js'
import { profileFor } from './embeddingProfiles.js'

// Merging near-duplicate entities ("Christopher Nolan" / "Chris Nolan") using their name embeddings.
//
// Merging is destructive (one entity is deleted and its links move to the other), so:
//   - only entities embedded by the SAME model are compared (scores from different models mean different things);
//   - each model has its own threshold (embeddingProfiles.ts), and a model with none ("entity: null") is never merged;
//   - the plan is computed first and nothing changes until the caller commits it;
//   - one entity takes part in at most one merge per run, so a chain A~B~C is never collapsed through steps where the
//     two ends are not themselves similar (run again to continue);
//   - one merge is one transaction, and it rolls back as a whole on any error.

/** Pairs scoring below this are never read from the database; every real threshold is higher. */
export const SCAN_FLOOR = 0.8

export interface EntityMergeCandidate {
  /** The entity that stays. */
  keepId: string
  keepName: string
  /** The entity that is merged into it and deleted. */
  dropId: string
  dropName: string
  type: string
  /** The embedding model both names were embedded with. */
  model: string
  score: number
  keepLinks: number
  dropLinks: number
}

export interface EntityMergePlan {
  candidates: EntityMergeCandidate[]
  /** Pairs above the threshold that wait for the next run because one of the entities is already merged in this one. */
  deferred: number
  /** Models that have entities but no entity threshold, so none of their entities are merged. */
  skippedModels: Array<{ model: string; pairs: number }>
}

interface PairRow {
  id1: string; name1: string; links1: string | number; created1: Date | string
  id2: string; name2: string; links2: string | number; created2: Date | string
  type: string; model: string; score: number | string
}

const time = (d: Date | string) => new Date(d).getTime()

/** Reads similar same-model entity pairs and decides which merges to propose. Reads only. */
export async function planEntityMerges(db: Pick<Pool, 'query'> = pool): Promise<EntityMergePlan> {
  const { rows } = await db.query<PairRow>(
    `WITH e AS (
       SELECT id, name, type, embedding, embedding_model, created_at,
              (SELECT count(*) FROM item_entities ie WHERE ie.entity_id = entities.id) AS links
       FROM entities
       WHERE embedding IS NOT NULL AND embedding_model IS NOT NULL
     )
     SELECT a.id AS id1, a.name AS name1, a.links AS links1, a.created_at AS created1,
            b.id AS id2, b.name AS name2, b.links AS links2, b.created_at AS created2,
            a.type, a.embedding_model AS model, (1 - (a.embedding <=> b.embedding)) AS score
     FROM e a
     JOIN e b ON a.id < b.id AND a.type = b.type
       AND a.embedding_model = b.embedding_model  -- vectors from different models are not comparable
     WHERE (1 - (a.embedding <=> b.embedding)) > $1
     ORDER BY score DESC, a.id, b.id`,
    [SCAN_FLOOR],
  )

  const candidates: EntityMergeCandidate[] = []
  const skipped = new Map<string, number>()
  const used = new Set<string>()
  let deferred = 0

  for (const r of rows) {
    const threshold = profileFor(r.model).entity
    if (threshold === null) {
      skipped.set(r.model, (skipped.get(r.model) ?? 0) + 1)
      continue
    }
    const score = Number(r.score)
    if (!(score > threshold)) continue
    if (used.has(r.id1) || used.has(r.id2)) { deferred++; continue }

    const l1 = Number(r.links1)
    const l2 = Number(r.links2)
    // Keep the entity that is linked from more items; on a tie the older one; on a tie the lower id (stable).
    const keepFirst = l1 !== l2 ? l1 > l2 : time(r.created1) !== time(r.created2) ? time(r.created1) < time(r.created2) : r.id1 < r.id2
    used.add(r.id1)
    used.add(r.id2)
    candidates.push(keepFirst
      ? { keepId: r.id1, keepName: r.name1, dropId: r.id2, dropName: r.name2, type: r.type, model: r.model, score, keepLinks: l1, dropLinks: l2 }
      : { keepId: r.id2, keepName: r.name2, dropId: r.id1, dropName: r.name1, type: r.type, model: r.model, score, keepLinks: l2, dropLinks: l1 })
  }

  return {
    candidates,
    deferred,
    skippedModels: [...skipped.entries()].map(([model, pairs]) => ({ model, pairs })),
  }
}

export interface MergeResult {
  /** Links moved from the dropped entity to the kept one. */
  relinked: number
  /** Links the dropped entity had that the kept one already had (same item and role): removed instead of moved. */
  alreadyLinked: number
}

/**
 * Merges `dropId` into `keepId` in one transaction: links move over, links that would collide are removed first (a
 * failed UPDATE would abort the whole transaction, so the collision is avoided rather than caught), then the dropped
 * entity is deleted. Any error rolls everything back.
 */
export async function mergeEntities(client: Pick<PoolClient, 'query'>, keepId: string, dropId: string): Promise<MergeResult> {
  if (keepId === dropId) throw new Error('Cannot merge an entity into itself')
  await client.query('BEGIN')
  try {
    const dup = await client.query(
      `DELETE FROM item_entities ie
       WHERE ie.entity_id = $2
         AND EXISTS (SELECT 1 FROM item_entities k WHERE k.entity_id = $1 AND k.item_id = ie.item_id AND k.role IS NOT DISTINCT FROM ie.role)`,
      [keepId, dropId],
    )
    const moved = await client.query('UPDATE item_entities SET entity_id = $1 WHERE entity_id = $2', [keepId, dropId])
    const gone = await client.query('DELETE FROM entities WHERE id = $1', [dropId])
    if ((gone.rowCount ?? 0) !== 1) throw new Error(`Entity ${dropId} no longer exists`)
    await client.query('COMMIT')
    return { relinked: moved.rowCount ?? 0, alreadyLinked: dup.rowCount ?? 0 }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}
