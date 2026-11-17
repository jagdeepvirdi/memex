import { OLLAMA_EMBED_MODEL } from '../lib/embeddingModel.js'
import { getSetting } from './settings.js'

// Which embedding model is active. Vectors from different models are not comparable, so there is exactly one active
// model at a time (settings `embedding_provider` + `embedding_model`), and every stored vector records the model that
// made it. The value is cached in memory so hot paths (every search, every similarity query) stay synchronous and
// query-free; `loadEmbeddingConfig()` refreshes it at startup and whenever the setting changes.
//
// This is a leaf module (no import of ai.ts / embedder.ts) so both can read it without an import cycle.

export type EmbeddingProvider = 'ollama' | 'gemini' | 'openai'
export const EMBEDDING_PROVIDERS: readonly EmbeddingProvider[] = ['ollama', 'gemini', 'openai']

/** Every embedding column is vector(768); cloud models are asked for 768 dimensions to fit without a schema change. */
export const EMBEDDING_DIMENSIONS = 768

/** Model ids are settings, not constants: providers retire and rename models. These are only the defaults. */
export const DEFAULT_EMBEDDING_MODELS: Record<EmbeddingProvider, string> = {
  ollama: OLLAMA_EMBED_MODEL,
  gemini: 'gemini-embedding-001',
  openai: 'text-embedding-3-small',
}

export interface ActiveEmbedding {
  provider: EmbeddingProvider
  model: string
  /** '<provider>:<model>', the value stored in `embedding_model` columns. */
  id: string
}

export function isEmbeddingProvider(v: unknown): v is EmbeddingProvider {
  return typeof v === 'string' && (EMBEDDING_PROVIDERS as readonly string[]).includes(v)
}

export function buildEmbedding(provider: EmbeddingProvider, model?: string | null): ActiveEmbedding {
  const m = model && model.trim() ? model.trim() : DEFAULT_EMBEDDING_MODELS[provider]
  return { provider, model: m, id: `${provider}:${m}` }
}

let current: ActiveEmbedding = buildEmbedding('ollama')

/** The embedding model currently in use (synchronous, from the in-memory cache). */
export function activeEmbedding(): ActiveEmbedding {
  return current
}

export function activeEmbeddingId(): string {
  return current.id
}

/** Reads the settings and refreshes the cache. An unknown or missing provider means local Ollama. */
export async function loadEmbeddingConfig(): Promise<ActiveEmbedding> {
  const provider = await getSetting<unknown>('embedding_provider', 'ollama')
  const model = await getSetting<unknown>('embedding_model', null)
  current = buildEmbedding(
    isEmbeddingProvider(provider) ? provider : 'ollama',
    typeof model === 'string' ? model : null,
  )
  return current
}

/** Pins the cache without touching the database (tests and one-off scripts); null restores local Ollama. */
export function setActiveEmbedding(active: ActiveEmbedding | null): void {
  current = active ?? buildEmbedding('ollama')
}
