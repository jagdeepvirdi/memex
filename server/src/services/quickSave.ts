// One-shot saves with no confirmation step: the browser bookmarklet (POST /api/ingest/quicksave) and the MCP server
// (POST /api/mcp/links and /notes) both save straight away, so the work lives here and the routes stay thin.

import { pool } from '../db/client.js'
import { createItem } from '../db/helpers.js'
import { scrapeUrl } from './scraper.js'
import { summarizeAndClassify } from './summarizer.js'
import { classify } from './classifier.js'
import { findSimilarItems, findItemsBySourceUrl } from './duplicateService.js'
import { embedForDuplicateCheck } from './embedder.js'
import { embedAndStoreItem } from './embeddingService.js'
import { extractAndLinkEntities } from './entityService.js'
import { detectPasteSource } from './sourceDetect.js'
import type { Item } from '../../../shared/types.js'

export interface QuickSaveResult {
  item: { id: string; title: string; type: string }
  similarItems: unknown[]
  /** Set when the page was already saved: the existing item is returned and nothing new is created. */
  duplicate?: true
}

/** Extra tags are added to whatever the AI chose (the MCP server uses `from-mcp`). */
export interface QuickSaveOptions {
  extraTags?: string[]
}

function withTags(tags: string[] | undefined, extra: string[] | undefined): string[] {
  const out = [...(tags ?? [])]
  for (const t of extra ?? []) if (!out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t)
  return out
}

/** Saves the same page once: a second call returns the existing item instead of making a copy. */
export async function quickSaveUrl(url: string, opts: QuickSaveOptions = {}): Promise<QuickSaveResult> {
  const [existing] = await findItemsBySourceUrl(url, 1)
  if (existing) {
    return { item: { id: existing.id, title: existing.title, type: existing.type }, similarItems: [], duplicate: true }
  }

  const scraped = await scrapeUrl(url)

  const [preview, embedding] = await Promise.all([
    summarizeAndClassify(scraped),
    embedForDuplicateCheck(scraped.content.slice(0, 2000)),
  ])

  const similarItems = await findSimilarItems(embedding)

  const savedItem = await insertItem({
    title: preview.title,
    type: preview.type,
    content: preview.content,
    structured: preview.structured as Record<string, unknown>,
    source: preview.source,
    sourceUrl: preview.sourceUrl,
    categories: preview.categories,
    tags: withTags(preview.tags, opts.extraTags),
    confidence: preview.confidence,
    intent: preview.intent,
  })

  return { item: { id: savedItem.id, title: savedItem.title, type: savedItem.type }, similarItems }
}

/** Saves a note: the AI picks the type, categories and tags; a title the caller gives wins over the AI's. */
export async function quickSaveText(
  text: string,
  opts: QuickSaveOptions & { title?: string } = {},
): Promise<QuickSaveResult> {
  const { source, sourceUrl } = detectPasteSource(text)

  const [classification, embedding] = await Promise.all([
    classify(text, { sourceUrl }),
    embedForDuplicateCheck(text.slice(0, 2000)),
  ])
  const similarItems = await findSimilarItems(embedding)

  const savedItem = await insertItem({
    title: opts.title?.trim() || classification.title,
    type: classification.type,
    content: text,
    structured: { ...classification.structured, summary: classification.summary },
    source,
    sourceUrl,
    categories: classification.categories,
    tags: withTags(classification.tags, opts.extraTags),
    confidence: classification.confidence,
    intent: classification.intent,
  })

  return { item: { id: savedItem.id, title: savedItem.title, type: savedItem.type }, similarItems }
}

async function insertItem(input: Parameters<typeof createItem>[1]): Promise<Item> {
  const client = await pool.connect()
  let savedItem: Item
  try {
    await client.query('BEGIN')
    savedItem = await createItem(client, { ...input, reviewed: false })
    await client.query('COMMIT')
    // Best effort, after the commit: link repo / creator / channel entities.
    await extractAndLinkEntities(client, savedItem.id, savedItem.type, savedItem.structured)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  // Embed in the background; a failure must not fail the save.
  void embedAndStoreItem(savedItem)
  return savedItem
}
