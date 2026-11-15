// Loads the text an on-demand AI action (explain / extract recipe) should read for an item.
//
// Saved video items are often just a bare URL (the YouTube backfill hasn't been run), so when the
// stored content has almost no prose we fetch the transcript on demand. Items that already hold a
// transcript or a real note use their stored content directly.

import { scrapeUrl, MAX_TRANSCRIPT_CHARS } from './scraper.js'
import { findYoutubeUrl } from './youtubeUrl.js'

/** Prose (URLs stripped) below this length counts as "bare link" and triggers a fetch. */
const BARE_LINK_MAX_CHARS = 200

export interface SourceItem {
  title: string
  content: string
  sourceUrl?: string | null
}

export interface SourceText {
  text: string
  basis: 'transcript' | 'content'
  /** True when the text was cut at MAX_TRANSCRIPT_CHARS. */
  truncated: boolean
  /** Video channel when we fetched it, for prompt context. */
  channel?: string
}

/** The item has nothing the model can read (private video, no captions, empty note). */
export class NoSourceTextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoSourceTextError'
  }
}

function proseLength(content: string): number {
  return content.replace(/https?:\/\/\S+/g, '').trim().length
}

export async function loadSourceText(item: SourceItem): Promise<SourceText> {
  const stored = (item.content ?? '').trim()
  const video = findYoutubeUrl(item.sourceUrl ?? '') ?? findYoutubeUrl(stored)

  if (video && proseLength(stored) <= BARE_LINK_MAX_CHARS) {
    // May throw when Strict Local Mode blocks external fetches — callers surface that as-is.
    const scraped = await scrapeUrl(video.url)
    if (!scraped.transcriptAvailable || !scraped.transcript) {
      throw new NoSourceTextError(
        `No transcript is available for this video${scraped.failure ? ` (${scraped.failure})` : ''}. ` +
          'It may be private, age-restricted or have captions disabled.',
      )
    }
    return {
      text: scraped.transcript,
      basis: 'transcript',
      truncated: scraped.transcriptTruncated === true,
      channel: scraped.channel,
    }
  }

  if (!stored) throw new NoSourceTextError('This item has no content to work from.')

  const truncated = stored.length > MAX_TRANSCRIPT_CHARS
  return {
    text: truncated ? stored.slice(0, MAX_TRANSCRIPT_CHARS) : stored,
    basis: video ? 'transcript' : 'content',
    truncated,
  }
}

/** Splits text into chunks of ~`size` chars, preferring sentence/whitespace boundaries. */
export function chunkText(text: string, size = 6000): string[] {
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + size, text.length)
    if (end < text.length) {
      const window = text.slice(start, end)
      const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'), window.lastIndexOf(' '))
      if (cut > size * 0.5) end = start + cut + 1
    }
    chunks.push(text.slice(start, end).trim())
    start = end
  }
  return chunks.filter(Boolean)
}
