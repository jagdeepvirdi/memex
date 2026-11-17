import { pool } from '../db/client.js'
import { listProviders } from './ai.js'
import { getAiConfig } from './settings.js'
import { activeEmbedding, type EmbeddingProvider } from './embeddingConfig.js'

export interface EmbeddingStatus {
  provider: EmbeddingProvider
  model: string
  id: string
  cloud: boolean
  /** A key exists for the provider (always true for local Ollama). */
  configured: boolean
  /** Whether new vectors can be made right now, and if not, why (shown to the user, never contains a key). */
  usable: boolean
  blockedReason: string | null
  counts: {
    /** Items whose vector was made by the active model. */
    embedded: number
    /** Items with a vector from a different model: they are ignored by search until re-embedded. */
    needsReembed: number
    /** Items deliberately not embedded because they must not leave this machine. */
    skippedPrivate: number
    /** Items waiting for a vector (the background worker retries these). */
    pending: number
    total: number
  }
}

/** What the AI settings tab shows about embeddings. Counts only; no item text and no keys. */
export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const active = activeEmbedding()
  const cloud = active.provider !== 'ollama'
  const [config, providers, { rows }] = await Promise.all([
    getAiConfig(),
    listProviders(),
    pool.query<Record<string, string>>(
      `SELECT count(*) FILTER (WHERE embedding IS NOT NULL AND embedding_model = $1) AS embedded,
              count(*) FILTER (WHERE embedding IS NOT NULL AND embedding_model IS DISTINCT FROM $1) AS needs_reembed,
              count(*) FILTER (WHERE embedding IS NULL AND embedding_skip = 'private') AS skipped_private,
              count(*) FILTER (WHERE embedding IS NULL AND embedding_skip IS NULL) AS pending,
              count(*) AS total
       FROM items WHERE deleted_at IS NULL`,
      [active.id],
    ),
  ])
  const configured = !cloud || (providers.find(p => p.id === active.provider)?.configured ?? false)

  let blockedReason: string | null = null
  if (cloud) {
    if (config.strictLocal) blockedReason = 'Strict Local Mode is on, so semantic search is paused and keyword search is used'
    else if (!config.allowCloud) blockedReason = 'Cloud AI is not enabled in Settings'
    else if (!configured) blockedReason = `No API key is configured for ${active.provider}`
  }

  const r = rows[0] ?? {}
  const n = (k: string) => Number(r[k] ?? 0)
  return {
    provider: active.provider,
    model: active.model,
    id: active.id,
    cloud,
    configured,
    usable: blockedReason === null,
    blockedReason,
    counts: {
      embedded: n('embedded'), needsReembed: n('needs_reembed'), skippedPrivate: n('skipped_private'),
      pending: n('pending'), total: n('total'),
    },
  }
}
