import { aiEmbed } from './ai.js'

// Maximum characters fed to the embedding model.
// nomic-embed-text has an 8192-token context; ~6000 chars is a safe limit.
const MAX_EMBED_CHARS = 6000

function buildEmbedText(title: string, content: string): string {
  const combined = `${title}\n\n${content}`.trim()
  return combined.slice(0, MAX_EMBED_CHARS)
}

export async function embedItem(title: string, content: string): Promise<number[]> {
  const text = buildEmbedText(title, content)
  return aiEmbed(text)
}

export async function embedQuery(query: string): Promise<number[]> {
  return aiEmbed(query.slice(0, MAX_EMBED_CHARS))
}
