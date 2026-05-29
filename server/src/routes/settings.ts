import { Router } from 'express';
import { randomBytes } from 'crypto';
import { pool } from '../db/client.js';

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
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  const settings = req.body;
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
    console.error('Failed to update settings:', error);
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
    console.error('Failed to generate bookmarklet key:', error);
    res.status(500).json({ error: 'Failed to generate key' });
  }
});

export default router;
