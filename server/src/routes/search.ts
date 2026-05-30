import { Router } from 'express';
import { pool } from '../db/client.js';
import { rowToItem } from '../db/helpers.js';
import { embedQuery } from '../services/embedder.js';
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

    // 1. Embed the query
    const vector = await embedQuery(query);
    const vectorStr = JSON.stringify(vector);

    // 2. Build Hybrid Search SQL
    // We combine semantic similarity (cosine) with full-text search rank.
    // Semantic score: 1 - (embedding <=> query_vector) -> higher is better
    // FTS score: ts_rank_cd -> higher is better
    
    const conditions: string[] = ['i.deleted_at IS NULL'];
    const params: unknown[] = [vectorStr, query]; // $1 = vector, $2 = query string
    let p = 3;

    if (type) {
      conditions.push(`i.type = $${p++}`);
      params.push(type);
    }

    if (category) {
      conditions.push(`EXISTS (
        SELECT 1 FROM item_categories ic
        JOIN categories c ON c.id = ic.category_id
        WHERE ic.item_id = i.id AND c.name = $${p++}
      )`);
      params.push(category);
    }

    if (tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM item_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE it.item_id = i.id AND t.name = $${p++}
      )`);
      params.push(tag.toLowerCase().trim());
    }

    const where = conditions.join(' AND ');

    // Hybrid SQL
    // We normalize scores roughly. ts_rank_cd can be > 1, cosine similarity is 0 to 1.
    // Weighted sum: 0.7 * semantic + 0.3 * FTS
    const sql = `
      SELECT
        i.id, i.title, i.type, i.content, i.structured,
        i.source, i.source_url, i.encrypted, i.created_at, i.updated_at,
        COALESCE(
          (SELECT array_agg(c.name ORDER BY ic2.depth)
           FROM item_categories ic2
           JOIN categories c ON c.id = ic2.category_id
           WHERE ic2.item_id = i.id),
          '{}'::text[]
        ) AS categories,
        COALESCE(
          (SELECT array_agg(t.name ORDER BY t.name)
           FROM item_tags it2
           JOIN tags t ON t.id = it2.tag_id
           WHERE it2.item_id = i.id),
          '{}'::text[]
        ) AS tags,
        (
          0.7 * (1 - (i.embedding <=> $1::vector)) +
          0.3 * ts_rank_cd(to_tsvector('english', i.title || ' ' || i.content), plainto_tsquery('english', $2))
        ) AS rank
      FROM items i
      WHERE ${where}
      ORDER BY rank DESC
      LIMIT $${p++}
    `;
    params.push(limit);

    const { rows } = await pool.query(sql, params);
    const items = rows.map(rowToItem);

    res.json({ items, total: items.length });
  } catch (error) {
    logger.error(error, 'Search error')
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

// ── GET /api/search/graph ─────────────────────────────────────────────────────

router.get('/graph', async (_req, res) => {
  try {
    // 1. Fetch all items (nodes)
    const { rows: nodes } = await pool.query(`
      SELECT id, title, type 
      FROM items 
      WHERE deleted_at IS NULL 
        AND embedding IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `)

    // 2. Build links based on semantic similarity
    // We'll use a cross-join with a distance threshold
    // This is expensive, so we limit to 100 nodes
    const linksSql = `
      WITH indexed_items AS (
        SELECT id, embedding FROM items 
        WHERE deleted_at IS NULL 
          AND embedding IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 100
      )
      SELECT a.id as source, b.id as target, (1 - (a.embedding <=> b.embedding)) as weight
      FROM indexed_items a
      JOIN indexed_items b ON a.id < b.id
      WHERE (1 - (a.embedding <=> b.embedding)) > 0.85
    `
    const { rows: links } = await pool.query(linksSql)

    res.json({ nodes, links })
  } catch (error) {
    logger.error(error, 'Graph error')
    res.status(500).json({ error: 'Failed to build graph' })
  }
})

export default router;
