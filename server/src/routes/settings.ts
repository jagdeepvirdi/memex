import { Router } from 'express';
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

export default router;
