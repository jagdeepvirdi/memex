import { aiEmbed } from './ai.js'
import logger from '../lib/logger.js'

// Maximum characters fed to the embedding model.
// nomic-embed-text has an 8192-token context; ~6000 chars is a safe limit.
const MAX_EMBED_CHARS = 6000

/** The exact text a document embedding sends (title, then content, capped). The privacy gate reads this same text. */
export function buildEmbedText(title: string, content: string): string {
  const combined = `${title}\n\n${content}`.trim()
  return combined.slice(0, MAX_EMBED_CHARS)
}

export async function embedItem(title: string, content: string, signal?: AbortSignal): Promise<number[]> {
  const text = buildEmbedText(title, content)
  return aiEmbed(text, { kind: 'document', signal })
}

export async function embedQuery(query: string): Promise<number[]> {
  return aiEmbed(query.slice(0, MAX_EMBED_CHARS), { kind: 'query' })
}

/**
 * The embedding a capture route uses for the "you may already have this" hint. That hint is a convenience, so a failed
 * embedding (no embedding model reachable or allowed: Ollama down, a cloud model blocked by Strict Local Mode or missing
 * consent, a provider outage) must never fail the save: it returns [] and the hint is skipped. `findSimilarItems` treats
 * an empty embedding as "nothing to compare". The item still gets its own embedding afterwards, from the background
 * worker if the first attempt fails.
 */
export async function embedForDuplicateCheck(text: string): Promise<number[]> {
  try {
    return await embedQuery(text)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Embedding for the duplicate check failed; saving without that hint')
    return []
  }
}
