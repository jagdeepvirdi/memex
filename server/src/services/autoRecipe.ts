// Pulls the recipe out of a saved cooking video on its own, so the user does not have to press "Extract recipe".
//
// Which saves qualify: a YouTube video the classifier called a recipe (`structured.videoKind === 'recipe'`), or a saved
// web link filed under Food that is not already a recipe. The existing extractor still decides whether a recipe is really
// there (its yes/no gate and completeness checks), so a cooking-adjacent page that has no recipe yields "none found", not
// an invented one. A found recipe becomes a NEW unreviewed item linked with `derived_from`; the saved link is untouched
// except for `structured.recipeExtraction`, which says what happened (queued / found / none / failed) so the item page can
// tell the user instead of staying silent.
//
// One AI job runs at a time (the same rule as the manual buttons), so saves queue up and run one after another. The queue
// lives in memory: a restart forgets waiting items, and the "Extract recipe" button still works for them.

import { pool } from '../db/client.js'
import { cloudSafe } from './cloudSafe.js'
import { anotherAiJobRunning, createAiJob, EXTRACT_RECIPE_JOB_KIND } from './actionJobs.js'
import { runExtractRecipeJob, type ExtractRecipeOutcome } from './extractRecipeJob.js'
import logger from '../lib/logger.js'
import type { Item } from '../../../shared/types.js'

/** How long a queued item waits for the running AI job to finish before it is left for the manual button. */
export const AUTO_RECIPE_MAX_WAIT_MS = 30 * 60_000
export const AUTO_RECIPE_POLL_MS = 5_000

export type RecipeExtractionState =
  | { status: 'queued'; at: string }
  | { status: 'found'; recipeId: string; at: string }
  | { status: 'none'; reason: string; at: string }
  | { status: 'failed'; reason: string; at: string }

type Candidate = Pick<Item, 'id' | 'title' | 'type' | 'source' | 'sourceUrl' | 'content' | 'structured' | 'categories' | 'encrypted' | 'tags'>

/** True for a saved recipe video, or a saved link filed under Food that is not a recipe item itself. */
export function shouldAutoExtractRecipe(item: Candidate): boolean {
  if (item.encrypted || item.type === 'password' || item.type === 'recipe') return false
  const s = item.structured as Record<string, unknown>
  if (s?.recipeExtraction) return false // already tried (or queued): the manual button is for a retry
  if (item.source === 'youtube' || typeof s?.videoId === 'string') return s?.videoKind === 'recipe'
  return item.type === 'link' && item.source === 'url' && item.categories[0] === 'Food'
}

const queue: Candidate[] = []
let draining = false

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function setState(itemId: string, state: RecipeExtractionState): Promise<void> {
  await pool.query(
    `UPDATE items SET structured = structured || $2::jsonb WHERE id = $1 AND deleted_at IS NULL`,
    [itemId, JSON.stringify({ recipeExtraction: state })],
  )
}

function toState(outcome: ExtractRecipeOutcome): RecipeExtractionState | null {
  const at = new Date().toISOString()
  switch (outcome.kind) {
    case 'found': return { status: 'found', recipeId: outcome.recipeId, at }
    case 'none': return { status: 'none', reason: outcome.reason, at }
    case 'failed': return { status: 'failed', reason: outcome.reason, at }
    case 'cancelled': return null
  }
}

async function runOne(item: Candidate): Promise<void> {
  const deadline = Date.now() + AUTO_RECIPE_MAX_WAIT_MS
  while (await anotherAiJobRunning()) {
    if (Date.now() > deadline) {
      await pool.query(
        `UPDATE items SET structured = structured - 'recipeExtraction' WHERE id = $1 AND deleted_at IS NULL`, [item.id],
      )
      logger.info(`[Recipe] gave up waiting to extract a recipe for ${item.id}; the Extract recipe button still works`)
      return
    }
    await sleep(AUTO_RECIPE_POLL_MS)
  }

  // It may have been deleted, or the user may have extracted it by hand while it waited.
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT NOT EXISTS (SELECT 1 FROM items WHERE derived_from = i.id AND type = 'recipe' AND deleted_at IS NULL) AS ok
     FROM items i WHERE i.id = $1 AND i.deleted_at IS NULL`, [item.id],
  )
  if (!rows[0]?.ok) return

  const jobId = await createAiJob(EXTRACT_RECIPE_JOB_KIND, item.id)
  await runExtractRecipeJob({
    jobId,
    itemId: item.id,
    title: item.title,
    content: item.content,
    sourceUrl: item.sourceUrl ?? null,
    source: item.source,
    cloudSafe: cloudSafe(item),
    sourceCategories: item.categories,
    onOutcome: async (outcome) => {
      const state = toState(outcome)
      if (state) await setState(item.id, state)
      else await pool.query(`UPDATE items SET structured = structured - 'recipeExtraction' WHERE id = $1`, [item.id])
    },
  })
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await runOne(next)
      } catch (err) {
        logger.error(err, `[Recipe] automatic extraction failed for ${next.id}`)
        await setState(next.id, { status: 'failed', reason: 'Could not start the automatic recipe extraction.', at: new Date().toISOString() }).catch(() => {})
      }
    }
  } finally {
    draining = false
  }
}

/**
 * Queues the automatic extraction for a just-saved item and returns at once (nothing here blocks the save). Returns
 * whether the item was queued. Never throws.
 */
export async function queueRecipeExtraction(item: Candidate): Promise<boolean> {
  try {
    if (!shouldAutoExtractRecipe(item)) return false
    await setState(item.id, { status: 'queued', at: new Date().toISOString() })
    queue.push(item)
    void drain()
    return true
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[Recipe] could not queue the automatic extraction')
    return false
  }
}

/** Test hook: forget everything that is waiting. */
export function resetRecipeQueueForTests(): void {
  queue.length = 0
  draining = false
}
