import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { aiChat, listProviders } from '../services/ai.js'
import { getAiConfig, type ProviderId } from '../services/settings.js'
import { listOllamaModels } from '../services/ollama.js'
import logger from '../lib/logger.js'

const router = Router()

// Suggestions only — the Settings UI also lets the user type any model id.
const SUGGESTED_MODELS: Record<'claude' | 'gemini', string[]> = {
  claude: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
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

/** Provider SDK errors can echo (part of) a key; never pass one to the client. */
function redact(message: string): string {
  let out = message
  for (const key of [process.env.ANTHROPIC_API_KEY, process.env.GEMINI_API_KEY]) {
    if (key) out = out.split(key).join('[redacted]')
  }
  return out.slice(0, 300)
}

// GET /api/ai/providers → [{ id, configured, cloud, models }]. Never returns keys.
router.get('/providers', async (_req, res) => {
  try {
    const [config, installed] = await Promise.all([getAiConfig(), listOllamaModels()])
    const models: Record<ProviderId, string[]> = {
      ollama: uniq([config.model, ...installed]),
      claude: uniq([config.claudeModel, ...SUGGESTED_MODELS.claude]),
      gemini: uniq([config.geminiModel, ...SUGGESTED_MODELS.gemini]),
    }
    res.json(listProviders().map(p => ({
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

const TestBody = z.object({ provider: z.enum(['ollama', 'claude', 'gemini']) })

// POST /api/ai/test { provider } → one tiny round-trip to verify the provider works.
// Sends a fixed prompt only (no user data). Honours strict-local and cloud consent like any other call.
router.post('/test', testLimiter, async (req, res) => {
  const parsed = TestBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'provider must be one of: ollama, claude, gemini' })
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

export default router
