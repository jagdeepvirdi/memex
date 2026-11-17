// Extract recipe as a background job (see explainJob.ts for why).
//
// "No recipe found" is a normal answer, not a failure: the job completes with `found: false` and the reason, and
// nothing is saved. When a recipe is found it becomes a NEW, unreviewed item linked to the source via derived_from;
// the source item is never touched.

import { pool } from '../db/client.js'
import { extractRecipe, renderRecipeContent, type RecipeProgress } from './recipeExtractor.js'
import { describeActionError } from './actionErrors.js'
import { reportJobProgress, completeJob, failJob, cancelJob } from './ingestJobs.js'
import { registerJobAbort, unregisterJob } from './jobControl.js'
import { AI_JOB_TIMEOUT_MS } from './actionJobs.js'
import { createItem } from '../db/helpers.js'
import { mapToCategories } from './classifier.js'
import { embedAndStoreItem } from './embeddingService.js'
import { findYoutubeUrl } from './youtubeUrl.js'
import logger from '../lib/logger.js'
import type { AiCallOptions } from './ai.js'
import type { ItemSource } from '../../../shared/types.js'

export interface ExtractRecipeJobInput {
  jobId: string
  itemId: string
  title: string
  content: string
  sourceUrl: string | null
  /** The source item's own `source`, used when it is not a video. */
  source: ItemSource
  provider?: AiCallOptions['provider']
  /** Result of cloudSafe(item); false pins the call to Ollama. */
  cloudSafe: boolean
}

/** What the job row's `details` carry, for the UI. */
export interface ExtractRecipeJobDetails {
  itemId: string
  stage?: RecipeProgress['stage']
  /** Set on completion. */
  found?: boolean
  /** When nothing was found: why. */
  reason?: string
  /** When found: the new recipe item and how complete it looks (0–100). */
  recipeId?: string
  confidence?: number
  model?: string
}

export async function runExtractRecipeJob(input: ExtractRecipeJobInput): Promise<void> {
  const { jobId, itemId } = input
  // The user can stop this job (POST /api/ingest/jobs/:id/cancel): that aborts `control`, which cancels the model call.
  const control = registerJobAbort(jobId)
  const signal = AbortSignal.any([control.signal, AbortSignal.timeout(AI_JOB_TIMEOUT_MS)])
  try {
    const result = await extractRecipe(
      { title: input.title, content: input.content, sourceUrl: input.sourceUrl },
      {
        provider: input.provider,
        cloudSafe: input.cloudSafe,
        signal,
        onProgress: p => {
          // Progress is a courtesy: a failed write must not stop the extraction.
          reportJobProgress(jobId, p.done, p.total, { itemId, stage: p.stage } satisfies ExtractRecipeJobDetails).catch(() => {})
        },
      },
    )

    // Cancelled just as it finished: honour the user's choice, create nothing.
    if (control.signal.aborted) {
      await cancelJob(jobId, { itemId } satisfies ExtractRecipeJobDetails).catch(() => {})
      return
    }

    if (!result.found) {
      await completeJob(jobId, { itemId, found: false, reason: result.reason, model: result.model } satisfies ExtractRecipeJobDetails)
      return
    }

    const structured = { ...result.recipe } as unknown as Record<string, unknown>
    const video = findYoutubeUrl(input.sourceUrl ?? '') ?? findYoutubeUrl(input.content)

    const client = await pool.connect()
    let recipeId: string
    let recipeTitle: string
    let recipeContent: string
    try {
      await client.query('BEGIN')
      const recipe = await createItem(client, {
        title: result.title,
        type: 'recipe',
        content: renderRecipeContent(result.title, result.recipe),
        structured,
        source: video ? 'youtube' : input.source,
        sourceUrl: input.sourceUrl ?? video?.url ?? undefined,
        categories: mapToCategories('recipe', structured),
        tags: ['recipe'],
        reviewed: false, // AI-made: goes to the review queue
        confidence: result.confidence,
        intent: 'actionable',
        derivedFrom: itemId,
      })
      await client.query('UPDATE items SET extraction_model = $1 WHERE id = $2', [result.model, recipe.id])
      await client.query('COMMIT')
      recipeId = recipe.id
      recipeTitle = recipe.title
      recipeContent = recipe.content
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    void embedAndStoreItem({ id: recipeId, title: recipeTitle, content: recipeContent })

    await completeJob(jobId, {
      itemId, found: true, recipeId, confidence: result.confidence, model: result.model,
    } satisfies ExtractRecipeJobDetails)
  } catch (err) {
    // A user cancel surfaces as an aborted call (an AbortError or a provider "timeout"): that is not a failure.
    if (control.signal.aborted) {
      await cancelJob(jobId, { itemId } satisfies ExtractRecipeJobDetails).catch(() => {})
      return
    }
    const known = describeActionError(err)
    if (!known) logger.error(err, `Extract recipe job ${jobId} failed`)
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    const message = known?.message
      ?? (timedOut ? 'Extracting took too long and was stopped. Try again, or pick a faster provider.' : 'Failed to extract recipe')
    await failJob(jobId, message, { itemId, ...(known?.kind ? { kind: known.kind } : {}) }).catch(() => {})
  } finally {
    unregisterJob(jobId)
  }
}
