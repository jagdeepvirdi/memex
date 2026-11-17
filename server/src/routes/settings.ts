import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { pool } from '../db/client.js';
import logger from '../lib/logger.js'

const router = Router();

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, any>);
    res.json(settings);
  } catch (error) {
    logger.error(error, 'Failed to fetch settings')
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings
const ProviderEnum = z.enum(['ollama', 'claude', 'gemini', 'openai'])
const modelName = z.string().trim().min(1).max(100)

// Only the AI-provider keys are validated; every other setting is stored as before.
const SettingsBody = z.object({
  ai_provider: ProviderEnum.optional(),
  ai_task_providers: z.record(z.string().min(1).max(50), ProviderEnum).optional(),
  allow_cloud: z.boolean().optional(),
  claude_model: modelName.optional(),
  gemini_model: modelName.optional(),
  openai_model: modelName.optional(),
}).passthrough();

// The embedding model decides which vectors search can see, and switching it sends library text to a provider, so it
// only changes through PUT /api/ai/embedding (validated, consent-checked, followed by an explicit re-embed).
const EMBEDDING_KEYS = ['embedding_provider', 'embedding_model'] as const

router.put('/', async (req, res) => {
  const blocked = EMBEDDING_KEYS.find(k => req.body && typeof req.body === 'object' && k in req.body);
  if (blocked) {
    res.status(400).json({ error: `${blocked} cannot be set here. Use PUT /api/ai/embedding.` });
    return;
  }
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid settings', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    return;
  }
  const settings = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `INSERT INTO settings (key, value, updated_at) 
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }
    await client.query('COMMIT');
    res.json({ status: 'ok' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(error, 'Failed to update settings')
    res.status(500).json({ error: 'Failed to update settings' });
  } finally {
    client.release();
  }
});

// POST /api/settings/bookmarklet-key — generate (or regenerate) a persistent API key
router.post('/bookmarklet-key', async (_req, res) => {
  const key = randomBytes(24).toString('hex')  // 48-char hex, never expires
  try {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('bookmarklet_key', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(key)]
    );
    res.json({ key });
  } catch (error) {
    logger.error(error, 'Failed to generate bookmarklet key')
    res.status(500).json({ error: 'Failed to generate key' });
  }
});

export default router;
