import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db/client.js';
import type { VaultItem, VaultMeta } from '../../../shared/types.js';

const router = Router();

/**
 * GET /api/vault/salt
 * Returns the salt for key derivation. Generates one if it doesn't exist.
 */
router.get('/salt', async (_req, res) => {
  try {
    const { rows } = await pool.query<{ salt: string }>('SELECT salt FROM vault_config WHERE id = 1');
    
    if (rows.length > 0) {
      return res.json({ salt: rows[0].salt } as VaultMeta);
    }

    // Generate new salt if not exists
    const salt = crypto.randomBytes(32).toString('base64');
    await pool.query('INSERT INTO vault_config (id, salt) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [salt]);
    
    // Fetch again just in case of race condition
    const finalResult = await pool.query<{ salt: string }>('SELECT salt FROM vault_config WHERE id = 1');
    res.json({ salt: finalResult.rows[0].salt } as VaultMeta);
  } catch (error) {
    console.error('Vault salt error:', error);
    res.status(500).json({ error: 'Failed to fetch vault salt' });
  }
});

/**
 * GET /api/vault
 * Returns all encrypted vault items.
 */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query<VaultItem>(
      'SELECT id, service, url, username, ciphertext, iv, created_at as "createdAt", updated_at as "updatedAt" FROM vault_items ORDER BY service ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Vault list error:', error);
    res.status(500).json({ error: 'Failed to fetch vault items' });
  }
});

/**
 * POST /api/vault
 * Creates a new encrypted vault item.
 */
router.post('/', async (req, res) => {
  try {
    const { service, url, username, ciphertext, iv } = req.body;

    if (!service || !ciphertext || !iv) {
      return res.status(400).json({ error: 'Service, ciphertext, and iv are required' });
    }

    const { rows } = await pool.query<VaultItem>(
      `INSERT INTO vault_items (service, url, username, ciphertext, iv)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, service, url, username, ciphertext, iv, created_at as "createdAt", updated_at as "updatedAt"`,
      [service, url, username, ciphertext, iv]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Vault create error:', error);
    res.status(500).json({ error: 'Failed to create vault item' });
  }
});

/**
 * PUT /api/vault/:id
 * Updates an existing encrypted vault item.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { service, url, username, ciphertext, iv } = req.body;

    const { rows } = await pool.query<VaultItem>(
      `UPDATE vault_items
       SET service = COALESCE($1, service),
           url = $2,
           username = $3,
           ciphertext = COALESCE($4, ciphertext),
           iv = COALESCE($5, iv)
       WHERE id = $6
       RETURNING id, service, url, username, ciphertext, iv, created_at as "createdAt", updated_at as "updatedAt"`,
      [service, url, username, ciphertext, iv, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vault item not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Vault update error:', error);
    res.status(500).json({ error: 'Failed to update vault item' });
  }
});

/**
 * DELETE /api/vault/:id
 * Deletes a vault item.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM vault_items WHERE id = $1', [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Vault item not found' });
    }

    res.status(204).end();
  } catch (error) {
    console.error('Vault delete error:', error);
    res.status(500).json({ error: 'Failed to delete vault item' });
  }
});

export default router;
