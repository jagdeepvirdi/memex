import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';
import { scrapeUrl } from '../services/scraper.js';
import { summarizeAndClassify } from '../services/summarizer.js';
import { parseKeepZip } from '../services/keepImporter.js';
import { classify, classifyBatch } from '../services/classifier.js';
import { convertToMarkdown, checkMarkitdownInstalled, SUPPORTED_MIME_TYPES } from '../services/markitdown.js';
import { pool } from '../db/client.js';
import { setItemCategories, setItemTags } from '../db/helpers.js';
import type { IngestUrlRequest } from '../../../shared/types.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Job {
  status: 'processing' | 'completed' | 'failed'
  progress: number
  total: number
  completed: number
  startedAt: number
  completedAt?: number
  results?: any[]
  error?: string
}

// In-memory job store
const jobs: Record<string, Job> = {};

// Background: classify saved items one by one and update DB records
async function classifyAndUpdateBatch(itemIds: string[], notes: any[], jobId: string) {
  const limit = pLimit(3);
  let completed = 0;

  const tasks = itemIds.map((id, i) => limit(async () => {
    const note = notes[i];
    const text = [note?.title, note?.content].filter(Boolean).join('\n\n');

    // Skip genuinely empty notes
    if (!text.trim()) {
      completed++;
      jobs[jobId].completed = completed;
      jobs[jobId].progress = Math.round((completed / itemIds.length) * 100);
      return;
    }

    try {
      const result = await classify(text);

      // Only write to DB if classification produced something meaningful
      if (!result.title || result.title === 'Untitled') {
        result.title = note?.title || note?.content?.split('\n')[0]?.slice(0, 80) || 'Untitled';
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE items SET type=$1, title=$2, structured=$3, updated_at=NOW() WHERE id=$4`,
          [result.type, result.title,
           JSON.stringify({ ...result.structured, summary: result.summary }), id]
        );
        const allTags = Array.from(new Set([...result.tags, ...(note?.labels || [])]));
        if (allTags.length > 0) await setItemTags(client, id, allTags);
        if (result.categories.length > 0) await setItemCategories(client, id, result.categories);
        await client.query('COMMIT');
        console.log(`[Classify] OK: ${result.title} → ${result.type}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Classify] DB update failed for ${id}:`, err);
      } finally {
        client.release();
      }
    } catch (err) {
      // Classification failed — leave structured={} so it stays pending and can be retried
      console.error(`[Classify] Failed for ${id}, leaving as pending`);
    }

    completed++;
    jobs[jobId].completed = completed;
    jobs[jobId].progress = Math.round((completed / itemIds.length) * 100);
    if (completed >= itemIds.length) {
      jobs[jobId].status = 'completed';
      jobs[jobId].completedAt = Date.now();
      const elapsed = ((jobs[jobId].completedAt! - jobs[jobId].startedAt) / 1000).toFixed(1);
      console.log(`[Keep import] Classified ${itemIds.length} items in ${elapsed}s`);
    }
  }));

  await Promise.all(tasks);
}

router.post('/url', async (req, res) => {
  try {
    const { url } = req.body as IngestUrlRequest;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const scraped = await scrapeUrl(url);
    const preview = await summarizeAndClassify(scraped);
    res.json({ preview });
  } catch (error) {
    console.error('Ingest URL error:', error);
    res.status(500).json({ error: 'Failed to ingest URL' });
  }
});

router.post('/keep', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const notes = parseKeepZip(req.file.buffer);
    res.json({ notes });
  } catch (error) {
    console.error('Keep ingest error:', error);
    res.status(500).json({ error: 'Failed to parse Keep ZIP' });
  }
});

// Save all notes immediately, classify in background
router.post('/keep/bulk', async (req, res) => {
  const { notes } = req.body;
  if (!Array.isArray(notes) || notes.length === 0) {
    return res.status(400).json({ error: 'Notes array required' });
  }

  const client = await pool.connect();
  const savedIds: string[] = [];

  try {
    await client.query('BEGIN');
    for (const note of notes) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO items (title, type, content, structured, source, reviewed)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [note.title || 'Untitled', 'note', note.content || '', JSON.stringify({}), 'keep', false]
      );
      const itemId = rows[0].id;
      savedIds.push(itemId);
      if (note.labels?.length > 0) await setItemTags(client, itemId, note.labels);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Bulk Keep insert error:', err);
    return res.status(500).json({ error: 'Failed to save notes to database' });
  }
  client.release();

  const jobId = uuidv4();
  jobs[jobId] = { status: 'processing', progress: 0, total: notes.length, completed: 0, startedAt: Date.now() };

  // Fire and forget — runs in background
  classifyAndUpdateBatch(savedIds, notes, jobId);

  console.log(`[Keep import] Saved ${savedIds.length} notes, background classification started (job ${jobId})`);
  res.json({ saved: savedIds.length, jobId });
});

router.post('/keep/classify', async (req, res) => {
  try {
    const { notes } = req.body;
    if (!Array.isArray(notes)) return res.status(400).json({ error: 'Notes array required' });

    const jobId = uuidv4();
    jobs[jobId] = { status: 'processing', progress: 0 };

    // Start processing in background
    classifyNotesBatch(notes, (p) => {
      jobs[jobId].progress = Math.round((p.completed / p.total) * 100);
    }).then(results => {
      jobs[jobId].status = 'completed';
      jobs[jobId].results = results;
    }).catch(err => {
      jobs[jobId].status = 'failed';
      jobs[jobId].error = err.message;
    });

    res.json({ jobId });
  } catch (error) {
    console.error('Batch classification error:', error);
    res.status(500).json({ error: 'Failed to start classification' });
  }
});

router.get('/jobs/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const elapsed = job.completedAt
    ? ((job.completedAt - job.startedAt) / 1000).toFixed(1)
    : ((Date.now() - job.startedAt) / 1000).toFixed(1);
  res.json({ ...job, elapsed });
});

// ── GET /api/ingest/markitdown/health ─────────────────────────────────────────

router.get('/markitdown/health', async (_req, res) => {
  const installed = await checkMarkitdownInstalled();
  res.json({ installed });
});

// ── POST /api/ingest/file — convert any document to Markdown → classify ───────

router.post('/file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { originalname, buffer, mimetype } = req.file;

  if (!SUPPORTED_MIME_TYPES.includes(mimetype) && !originalname.match(/\.(pdf|docx?|pptx?|xlsx?|csv|jpe?g|png|gif|webp|bmp|html?|xml|json|epub|txt|md)$/i)) {
    return res.status(415).json({ error: `Unsupported file type: ${mimetype}` });
  }

  try {
    const markdown = await convertToMarkdown(buffer, originalname);

    if (!markdown.trim()) {
      return res.status(422).json({ error: 'No text could be extracted from this file.' });
    }

    // Classify using first 3000 chars — enough context without overwhelming Ollama
    const classification = await classify(markdown.slice(0, 3000));

    // Fall back to filename (without extension) if AI didn't infer a title
    if (!classification.title || classification.title === 'Untitled') {
      classification.title = originalname.replace(/\.[^.]+$/, '');
    }

    res.json({
      preview: {
        title: classification.title,
        type: classification.type,
        content: markdown,
        structured: { ...classification.structured, summary: classification.summary },
        categories: classification.categories,
        tags: classification.tags,
        source: 'manual',
        sourceUrl: undefined,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'File conversion failed';
    console.error('File ingest error:', err);
    if (msg.includes('not found')) {
      return res.status(503).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

router.post('/text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const classification = await classify(text);
    res.json({
      preview: {
        title: classification.title,
        type: classification.type,
        content: text,
        structured: { ...classification.structured, summary: classification.summary },
        categories: classification.categories,
        tags: classification.tags,
        source: 'manual'
      }
    });
  } catch (error) {
    console.error('Text classification error:', error);
    res.status(500).json({ error: 'Failed to classify text' });
  }
});

export default router;
