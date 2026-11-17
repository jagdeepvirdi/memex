import { Router } from 'express';
import { pool } from '../db/client.js';
import { rowToItem } from '../db/helpers.js';
import { retrieveItems } from '../services/retrievalService.js';
import { activeEmbeddingId } from '../services/embeddingService.js';
import { activeProfile } from '../services/embeddingProfiles.js';
import { askKnowledge } from '../services/ragService.js';
import type { ItemType } from '../../../shared/types.js';
import logger from '../lib/logger.js'

const router = Router();

// ── POST /api/ask ────────────────────────────────────────────────────────────

router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const response = await askKnowledge(question);
    res.json(response);
  } catch (error) {
    logger.error(error, 'Ask knowledge error')
    res.status(500).json({ error: 'Failed to answer question' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { query, type, category, tag, limit = 20 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    // Hybrid semantic + keyword search; falls back to keywords when the query cannot be embedded.
    const { items, semantic } = await retrieveItems({ query, type, category, tag, limit });

    res.json({ items, total: items.length, semantic });
  } catch (error) {
    logger.error(error, 'Search error')
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

// ── GET /api/search/graph ─────────────────────────────────────────────────────

router.get('/graph', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string || '100', 10), 10), 500);

    // 1. Fetch all items (nodes)
    const { rows: nodes } = await pool.query(`
      SELECT id, title, type 
      FROM items 
      WHERE deleted_at IS NULL 
        AND embedding IS NOT NULL
        AND embedding_model = $2
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit, activeEmbeddingId()])

    // 2. Build links based on semantic similarity, using the active model's graph threshold (a cosine score means
    // different things in different models). A model nobody has measured yet draws no semantic links rather than
    // guessing: the nodes are still returned.
    const threshold = activeProfile().graph
    if (threshold === null) {
      res.json({ nodes, links: [], semanticLinks: false })
      return
    }

    // We'll use a cross-join with a distance threshold
    // This is expensive, so we limit to same count
    const linksSql = `
      WITH indexed_items AS (
        SELECT id, embedding FROM items 
        WHERE deleted_at IS NULL 
          AND embedding IS NOT NULL
          AND embedding_model = $2
        ORDER BY created_at DESC
        LIMIT $1
      )
      SELECT a.id as source, b.id as target, (1 - (a.embedding <=> b.embedding)) as weight
      FROM indexed_items a
      JOIN indexed_items b ON a.id < b.id
      WHERE (1 - (a.embedding <=> b.embedding)) > $3
    `
    const { rows: links } = await pool.query(linksSql, [limit, activeEmbeddingId(), threshold])

    res.json({ nodes, links, semanticLinks: true })
  } catch (error) {
    logger.error(error, 'Graph error')
    res.status(500).json({ error: 'Failed to build graph' })
  }
})

export default router;
