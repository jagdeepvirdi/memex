import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { aiChat, listProviders } from '../services/ai.js'
import { getAiConfig, type ProviderId } from '../services/settings.js'
import {
  redactSecrets, getKeyStatuses, getKeyStatus, setApiKey, deleteApiKey, isKeyProvider, InvalidApiKeyError,
} from '../services/apiKeys.js'
import { checkYoutubeKey } from '../services/youtubeApi.js'
import { listOllamaModels } from '../services/ollama.js'
import { v4 as uuidv4 } from 'uuid'
import { getEmbeddingStatus, embeddingBlockedReason } from '../services/embeddingStatus.js'
import { estimateReembed, switchEmbeddingModel, reembedRunning, EmbeddingSwitchError } from '../services/embeddingSwitch.js'
import { activeEmbedding, buildEmbedding, EMBEDDING_PROVIDERS } from '../services/embeddingConfig.js'
import { runReembedJob, REEMBED_JOB_KIND } from '../services/reembedJob.js'
import { createJob } from '../services/ingestJobs.js'
import logger from '../lib/logger.js'

const router = Router()

// Suggestions only — the Settings UI also lets the user type any model id.
const SUGGESTED_MODELS: Record<'claude' | 'gemini' | 'openai', string[]> = {
  claude: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  gemini: ['gemini-3.8-flash', 'gemini-2.5-pro'],
  openai: ['gpt-5.4-mini', 'gpt-5.2'],
}

// Each test is a real (tiny) round-trip, so keep it from being hammered.
const testLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.AI_TEST_RATE_LIMIT_MAX ?? 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many connection tests. Slow down.' },
})

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

/** Provider SDK errors can echo (part of) a key — env or saved; never pass one to the client. */
function redact(message: string): string {
  return redactSecrets(message).slice(0, 300)
}

// GET /api/ai/providers → [{ id, configured, cloud, models }]. Never returns keys.
router.get('/providers', async (_req, res) => {
  try {
    const [config, installed] = await Promise.all([getAiConfig(), listOllamaModels()])
    const models: Record<ProviderId, string[]> = {
      ollama: uniq([config.model, ...installed]),
      claude: uniq([config.claudeModel, ...SUGGESTED_MODELS.claude]),
      gemini: uniq([config.geminiModel, ...SUGGESTED_MODELS.gemini]),
      openai: uniq([config.openaiModel, ...SUGGESTED_MODELS.openai]),
    }
    res.json((await listProviders()).map(p => ({
      id: p.id,
      configured: p.configured,
      cloud: p.id !== 'ollama',
      models: models[p.id],
    })))
  } catch (err) {
    logger.error(err, 'GET /api/ai/providers error')
    res.status(500).json({ error: 'Failed to list AI providers' })
  }
})

// GET /api/ai/embedding → active embedding model, whether it can be used right now, and counts of items by state.
router.get('/embedding', async (_req, res) => {
  try {
    res.json(await getEmbeddingStatus())
  } catch (err) {
    logger.error(err, 'GET /api/ai/embedding error')
    res.status(500).json({ error: 'Failed to read embedding status' })
  }
})

const EmbeddingTarget = z.object({
  provider: z.enum(EMBEDDING_PROVIDERS as unknown as [string, ...string[]]),
  model: z.string().trim().min(1).max(100).optional(),
})

const embeddingWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.AI_EMBEDDING_RATE_LIMIT_MAX ?? 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many embedding changes. Slow down.' },
})

// GET /api/ai/embedding/estimate?provider=&model= → what switching to (or re-embedding with) that model would do.
// Read-only: nothing is sent anywhere. Without a provider it estimates the model that is active now.
router.get('/embedding/estimate', async (req, res) => {
  const parsed = req.query.provider === undefined ? null : EmbeddingTarget.safeParse(req.query)
  if (parsed && !parsed.success) return res.status(400).json({ error: 'Invalid embedding provider or model' })
  try {
    const target = parsed?.success ? buildEmbedding(parsed.data.provider as 'ollama' | 'gemini' | 'openai', parsed.data.model) : activeEmbedding()
    res.json(await estimateReembed(target))
  } catch (err) {
    logger.error(err, 'GET /api/ai/embedding/estimate error')
    res.status(500).json({ error: 'Failed to estimate the re-embed' })
  }
})

// PUT /api/ai/embedding { provider, model? } → makes that the active embedding model. Sends nothing and starts no job;
// until the library is re-embedded, search uses the vectors it has for the new model and keywords for the rest.
router.put('/embedding', embeddingWriteLimiter, async (req, res) => {
  const parsed = EmbeddingTarget.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Invalid embedding provider or model' })
  try {
    await switchEmbeddingModel(parsed.data.provider as 'ollama' | 'gemini' | 'openai', parsed.data.model)
    res.json(await getEmbeddingStatus())
  } catch (err) {
    if (err instanceof EmbeddingSwitchError) return res.status(err.status).json({ error: err.message })
    logger.error(err, 'PUT /api/ai/embedding error')
    res.status(500).json({ error: 'Failed to switch the embedding model' })
  }
})

// POST /api/ai/embedding/reembed { confirm: true, id } → 202 { jobId }. Embeds every item that has no vector from the
// ACTIVE model (private items stay home under a cloud model). `id` is the model the user saw in the estimate: if the
// active model changed since, nothing starts. Poll GET /api/ingest/jobs/:id; cancel with POST /api/ingest/jobs/:id/cancel.
const ReembedBody = z.object({ confirm: z.literal(true), id: z.string().min(1).max(200) })

router.post('/embedding/reembed', embeddingWriteLimiter, async (req, res) => {
  const parsed = ReembedBody.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Re-embedding must be confirmed ({"confirm": true, "id": "<provider>:<model>"})' })
  try {
    const target = activeEmbedding()
    if (parsed.data.id !== target.id) {
      return res.status(409).json({ error: 'The embedding model changed. Reload and estimate again.' })
    }
    const blocked = await embeddingBlockedReason(target)
    if (blocked) return res.status(409).json({ error: blocked })
    if (await reembedRunning()) return res.status(409).json({ error: 'A re-embed is already running.' })

    const jobId = uuidv4()
    await createJob(jobId, 1, REEMBED_JOB_KIND)
    // Runs in this process and reports on the job row; it never throws (failures are stored on the row).
    void runReembedJob({ jobId, target })
    res.status(202).json({ jobId })
  } catch (err) {
    logger.error(err, 'POST /api/ai/embedding/reembed error')
    res.status(500).json({ error: 'Failed to start the re-embed' })
  }
})

const TestBody = z.object({ provider: z.enum(['ollama', 'claude', 'gemini', 'openai']) })

// POST /api/ai/test { provider } → one tiny round-trip to verify the provider works.
// Sends a fixed prompt only (no user data). Honours strict-local and cloud consent like any other call.
router.post('/test', testLimiter, async (req, res) => {
  const parsed = TestBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'provider must be one of: ollama, claude, gemini, openai' })
    return
  }
  const { provider } = parsed.data

  const started = Date.now()
  let model = ''
  try {
    const reply = await aiChat(
      'Reply with the single word OK.', undefined, undefined,
      { temperature: 0, num_predict: 16 },
      AbortSignal.timeout(30_000),
      { provider, task: 'test', userInitiated: true, onProvider: info => { model = info.model } },
    )
    res.json({ ok: true, provider, model, latencyMs: Date.now() - started, reply: reply.trim().slice(0, 40) })
  } catch (err) {
    const kind = (err as { kind?: string }).kind ?? 'unavailable'
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({ provider, kind }, 'AI provider test failed')
    // 200 with ok:false — a failed test is an expected outcome the UI shows inline, not a server error.
    res.json({ ok: false, provider, kind, error: redact(message) })
  }
})

// ── API keys (entered in Settings) ───────────────────────────────────────────
// Keys are write-only: no response ever contains one — only {configured, source, last4}.

/**
 * Key management needs a real login session. The bookmarklet key also passes the global auth
 * middleware, but it lives inside a browser bookmark and must not be able to read or replace keys.
 */
function requireSession(req: Request, res: Response, next: NextFunction) {
  if ((req as { user?: unknown }).user === 'bookmarklet') {
    res.status(403).json({ error: 'API keys can only be managed from a signed-in session.' })
    return
  }
  next()
}

const keyWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.AI_KEY_RATE_LIMIT_MAX ?? 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many key changes. Slow down.' },
})

const KeyBody = z.object({ key: z.string() })

// GET /api/ai/keys → [{ provider, label, configured, source, last4?, hasStored, undecryptable }]
router.get('/keys', requireSession, async (_req, res) => {
  try {
    res.json(await getKeyStatuses())
  } catch (err) {
    logger.error({ err: redact(String(err)) }, 'GET /api/ai/keys error')
    res.status(500).json({ error: 'Failed to read API key status' })
  }
})

// PUT /api/ai/keys/:provider { key } → saves the key encrypted; returns the new status (never the key).
router.put('/keys/:provider', requireSession, keyWriteLimiter, async (req, res) => {
  const provider = req.params.provider
  if (!isKeyProvider(provider)) {
    res.status(400).json({ error: 'provider must be one of: claude, gemini, openai, youtube' })
    return
  }
  const body = KeyBody.safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Send the key as { "key": "…" }' })
    return
  }
  try {
    await setApiKey(provider, body.data.key)
    res.json(await getKeyStatus(provider))
  } catch (err) {
    if (err instanceof InvalidApiKeyError) {
      res.status(400).json({ error: err.message })
      return
    }
    // 42P01: table missing (migration 023). 23514: the table predates migration 024 and rejects an OpenAI key.
    const code = (err as { code?: string }).code
    if (code === '42P01' || code === '23514') {
      res.status(503).json({ error: 'The database needs its latest migration — run "npm run migrate" in server/ and try again.' })
      return
    }
    logger.error({ provider, err: redact(String(err)) }, 'PUT /api/ai/keys error')
    res.status(500).json({ error: 'Failed to save the key' })
  }
})

// DELETE /api/ai/keys/:provider → removes the saved key (an environment key, if any, is untouched).
router.delete('/keys/:provider', requireSession, keyWriteLimiter, async (req, res) => {
  const provider = req.params.provider
  if (!isKeyProvider(provider)) {
    res.status(400).json({ error: 'provider must be one of: claude, gemini, openai, youtube' })
    return
  }
  try {
    await deleteApiKey(provider)
    res.json(await getKeyStatus(provider))
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') {
      res.status(503).json({ error: 'The api_keys table is missing — run "npm run migrate" in server/ and try again.' })
      return
    }
    logger.error({ provider, err: redact(String(err)) }, 'DELETE /api/ai/keys error')
    res.status(500).json({ error: 'Failed to remove the key' })
  }
})

// POST /api/ai/keys/youtube/test → one real request to the YouTube Data API (1 quota unit).
// (Claude and Gemini keys are checked with POST /api/ai/test.)
router.post('/keys/youtube/test', requireSession, testLimiter, async (_req, res) => {
  try {
    const out = await checkYoutubeKey()
    res.json(out.ok ? { ok: true } : { ok: false, kind: out.kind, error: redact(out.error) })
  } catch (err) {
    logger.warn({ err: redact(String(err)) }, 'YouTube key test failed')
    res.json({ ok: false, kind: 'unavailable', error: 'The test could not be completed.' })
  }
})

export default router
