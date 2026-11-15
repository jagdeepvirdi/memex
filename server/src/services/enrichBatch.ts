// Background classification of freshly-saved items. Shared by the Keep import and the paste import.
//
// Items are saved instantly (so the user sees them at once) and classified here, up to 3 at a time.
// Reviewed items get their extraction recorded but are never overwritten. Failures are tracked per
// item and reported in the job's `details` rather than silently leaving items pending.

import pLimit from 'p-limit'
import { pool } from '../db/client.js'
import { classify } from './classifier.js'
import { setItemCategories, setItemTags, createItem } from '../db/helpers.js'
import { extractAndLinkEntities } from './entityService.js'
import { updateJobProgress, completeJob, failJob } from './ingestJobs.js'
import logger from '../lib/logger.js'
import type { ItemSource } from '../../../shared/types.js'

/** What the classifier needs to know about a saved item (parallel to the saved item ids). */
export interface BatchEntry {
  title?: string
  content?: string
  labels?: string[]
  source: ItemSource
  /** Passed to the classifier as a hint and inherited by split items that have no URL of their own. */
  sourceUrl?: string
}

export interface BatchFailure {
  itemId: string
  title: string
  error: string
}

export interface BatchOptions {
  /** Merged into the job's final `details` (e.g. the per-entry save results). */
  details?: Record<string, unknown>
}

/** A URL the model attached to one split entity (e.g. each repo in a multi-repo caption). */
function entityUrl(entity: Record<string, unknown>): string | undefined {
  for (const key of ['repoUrl', 'sourceUrl', 'url']) {
    const v = entity[key]
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
  }
  return undefined
}

export async function classifyAndUpdateBatch(
  itemIds: string[],
  entries: BatchEntry[],
  jobId: string,
  opts: BatchOptions = {},
): Promise<void> {
  const limit = pLimit(3)
  let completed = 0
  let classified = 0
  const failures: BatchFailure[] = []

  const tick = async () => {
    completed++
    await updateJobProgress(jobId, completed, itemIds.length).catch(() => {})
  }

  const tasks = itemIds.map((id, i) => limit(async () => {
    const entry = entries[i]
    const text = [entry?.title, entry?.content].filter(Boolean).join('\n\n')

    // Skip genuinely empty notes
    if (!text.trim()) {
      await tick()
      return
    }

    try {
      const result = entry?.sourceUrl ? await classify(text, { sourceUrl: entry.sourceUrl }) : await classify(text)

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Check if user has manually reviewed this item — if so, record extraction but don't auto-apply
        const { rows: itemMeta } = await client.query<{ reviewed: boolean }>(
          'SELECT reviewed FROM items WHERE id = $1', [id],
        )
        const isReviewed = itemMeta[0]?.reviewed ?? false

        if (result.multiEntity && result.entities && result.entities.length > 0) {
          logger.info(`[Classify] Multi-entity detected for ${id}: ${result.entities.length} entities`)

          for (const entity of result.entities) {
            const newItem = await createItem(client, {
              title: (entity.title as string) || (entity.name as string) || 'Untitled Entity',
              type: result.type,
              content: `Extracted from: ${entry?.title || 'Untitled note'}\n\nSummary: ${result.summary}`,
              structured: { ...entity, summary: result.summary },
              source: entry?.source ?? 'keep',
              // Each split item gets its own URL when the model found one, else the note's.
              sourceUrl: entityUrl(entity) ?? entry?.sourceUrl,
              categories: result.categories,
              tags: result.tags,
              reviewed: false,
              confidence: result.confidence,
              intent: result.intent,
            })
            await extractAndLinkEntities(client, newItem.id, newItem.type, newItem.structured)
          }

          // Mark original note as split regardless of reviewed status
          await client.query(
            `UPDATE items SET title=$1, structured=$2, updated_at=NOW(), confidence=$3 WHERE id=$4`,
            [`[Split] ${entry?.title || 'Untitled'}`,
             JSON.stringify({ summary: `Split into ${result.entities.length} items.`, originalType: result.type }),
             result.confidence, id],
          )
        } else {
          if (!result.title || result.title === 'Untitled') {
            result.title = entry?.title || entry?.content?.split('\n')[0]?.slice(0, 80) || 'Untitled'
          }
          const allTags = Array.from(new Set([...result.tags, ...(entry?.labels || [])]))
          const structuredWithSummary = { ...result.structured, summary: result.summary }

          // Always record extraction in provenance log
          await client.query(
            `INSERT INTO item_extractions
               (item_id, model, type, title, summary, structured, categories, tags, confidence, applied, intent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, result.model ?? 'unknown', result.type, result.title, result.summary,
             JSON.stringify(structuredWithSummary), result.categories, allTags,
             result.confidence, !isReviewed, result.intent ?? null],
          )

          if (!isReviewed) {
            // Apply extraction to live item
            await client.query(
              `UPDATE items SET type=$1, title=$2, structured=$3, extraction_model=$4, updated_at=NOW(), confidence=$5,
                                intent=COALESCE($7, intent)
               WHERE id=$6`,
              [result.type, result.title, JSON.stringify(structuredWithSummary),
               result.model ?? 'unknown', result.confidence, id, result.intent ?? null],
            )
            if (allTags.length > 0) await setItemTags(client, id, allTags)
            if (result.categories.length > 0) await setItemCategories(client, id, result.categories)
            await extractAndLinkEntities(client, id, result.type, structuredWithSummary)
          } else {
            logger.info(`[Classify] Skipped applying to reviewed item ${id} — extraction saved for review`)
          }
        }
        await client.query('COMMIT')
        classified++
        logger.info(`[Classify] OK: ${result.title} → ${result.type}${isReviewed ? ' (extraction only — item reviewed)' : ''}`)
      } catch (err) {
        await client.query('ROLLBACK')
        logger.error(err, `[Classify] DB update failed for ${id}`)
        failures.push({ itemId: id, title: entry?.title || text.slice(0, 60), error: `Save failed: ${err instanceof Error ? err.message : String(err)}` })
      } finally {
        client.release()
      }
    } catch (err) {
      logger.error(`[Classify] Failed for ${id}, leaving as pending`)
      failures.push({ itemId: id, title: entry?.title || text.slice(0, 60), error: err instanceof Error ? err.message : String(err) })
    }

    await tick()
  }))

  await Promise.all(tasks)

  // Finish once, after every task (including empty-note early returns) has settled.
  const details = { ...opts.details, classified, failed: failures }
  if (failures.length > 0 && classified === 0 && failures.length === itemIds.length) {
    await failJob(jobId, 'Classification failed for every item — is Ollama running? The items were saved and can be re-processed later.', details).catch(() => {})
    return
  }
  await completeJob(jobId, details).catch(() => {})
}
