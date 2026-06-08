import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';
import { scrapeUrl } from '../services/scraper.js';
import { summarizeAndClassify } from '../services/summarizer.js';
import { parseKeepZipAsync, type KeepNote } from '../services/keepImporter.js';
import { classify, classifyBatch } from '../services/classifier.js';
import { convertToMarkdown, checkMarkitdownInstalled, SUPPORTED_MIME_TYPES } from '../services/markitdown.js';
import { describeImage, getAvailableVisionModel, isImageMime } from '../services/visionService.js';
import { transcribeAudio, checkWhisperInstalled, isAudioMime } from '../services/whisperService.js';
import { findSimilarItems } from '../services/duplicateService.js';
import { embedQuery, embedItem } from '../services/embedder.js';
import { pool } from '../db/client.js';
import { setItemCategories, setItemTags, createItem } from '../db/helpers.js';
import { extractAndLinkEntities } from '../services/entityService.js';
import type { IngestUrlRequest } from '../../../shared/types.js';
import logger from '../lib/logger.js'

const router = Router();

// Throttle ingest endpoints to prevent hammering Ollama via a misconfigured
// bookmarklet, script, or share-target. Keep ZIPs and job-status polling are
// excluded — they're already protected by multipart limits / cheap DB reads.
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: Number(process.env.INGEST_RATE_LIMIT_MAX ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many ingest requests. Slow down.' },
})

// 50 MB cap for documents and images; 100 MB for audio; 500 MB for Keep ZIPs.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
})
const keepUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
})

// ── Job helpers — DB-backed so progress survives server restarts ──────────────

async function createJob(id: string, total: number): Promise<void> {
  await pool.query(
    `INSERT INTO ingest_jobs (id, status, progress, total, completed)
     VALUES ($1, 'processing', 0, $2, 0)`,
    [id, total],
  )
}

async function updateJobProgress(id: string, completed: number, total: number): Promise<void> {
  await pool.query(
    'UPDATE ingest_jobs SET completed=$1, progress=$2 WHERE id=$3',
    [completed, Math.round((completed / total) * 100), id],
  )
}

async function completeJob(id: string): Promise<void> {
  await pool.query(
    "UPDATE ingest_jobs SET status='completed', completed_at=NOW() WHERE id=$1",
    [id],
  )
}

async function failJob(id: string, error: string): Promise<void> {
  await pool.query(
    "UPDATE ingest_jobs SET status='failed', error=$2, completed_at=NOW() WHERE id=$1",
    [id, error],
  )
}

// Background: classify saved items one by one and update DB records
async function classifyAndUpdateBatch(itemIds: string[], notes: KeepNote[], jobId: string) {
  const limit = pLimit(3);
  let completed = 0;

  const tasks = itemIds.map((id, i) => limit(async () => {
    const note = notes[i];
    const text = [note?.title, note?.content].filter(Boolean).join('\n\n');

    // Skip genuinely empty notes
    if (!text.trim()) {
      completed++;
      await updateJobProgress(jobId, completed, itemIds.length).catch(() => {});
      return;
    }

    try {
      const result = await classify(text);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check if user has manually reviewed this item — if so, record extraction but don't auto-apply
        const { rows: itemMeta } = await client.query<{ reviewed: boolean }>(
          'SELECT reviewed FROM items WHERE id = $1', [id]
        );
        const isReviewed = itemMeta[0]?.reviewed ?? false;

        if (result.multiEntity && result.entities && result.entities.length > 0) {
          logger.info(`[Classify] Multi-entity detected for ${id}: ${result.entities.length} entities`)

          for (const entity of result.entities) {
            const newItem = await createItem(client, {
              title: (entity.title as string) || (entity.name as string) || 'Untitled Entity',
              type: result.type,
              content: `Extracted from: ${note?.title || 'Untitled note'}\n\nSummary: ${result.summary}`,
              structured: { ...entity, summary: result.summary },
              source: 'keep',
              categories: result.categories,
              tags: result.tags,
              reviewed: false,
              confidence: result.confidence
            });
            await extractAndLinkEntities(client, newItem.id, newItem.type, newItem.structured);
          }

          // Mark original note as split regardless of reviewed status
          await client.query(
            `UPDATE items SET title=$1, structured=$2, updated_at=NOW(), confidence=$3 WHERE id=$4`,
            [`[Split] ${note?.title || 'Untitled'}`,
             JSON.stringify({ summary: `Split into ${result.entities.length} items.`, originalType: result.type }),
             result.confidence, id]
          );
        } else {
          if (!result.title || result.title === 'Untitled') {
            result.title = note?.title || note?.content?.split('\n')[0]?.slice(0, 80) || 'Untitled';
          }
          const allTags = Array.from(new Set([...result.tags, ...(note?.labels || [])]));
          const structuredWithSummary = { ...result.structured, summary: result.summary };

          // Always record extraction in provenance log
          await client.query(
            `INSERT INTO item_extractions
               (item_id, model, type, title, summary, structured, categories, tags, confidence, applied)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, result.model ?? 'unknown', result.type, result.title, result.summary,
             JSON.stringify(structuredWithSummary), result.categories, allTags,
             result.confidence, !isReviewed]
          );

          if (!isReviewed) {
            // Apply extraction to live item
            await client.query(
              `UPDATE items SET type=$1, title=$2, structured=$3, extraction_model=$4, updated_at=NOW(), confidence=$5 WHERE id=$6`,
              [result.type, result.title, JSON.stringify(structuredWithSummary),
               result.model ?? 'unknown', result.confidence, id]
            );
            if (allTags.length > 0) await setItemTags(client, id, allTags);
            if (result.categories.length > 0) await setItemCategories(client, id, result.categories);
            await extractAndLinkEntities(client, id, result.type, structuredWithSummary);
          } else {
            logger.info(`[Classify] Skipped applying to reviewed item ${id} — extraction saved for review`)
          }
        }
        await client.query('COMMIT');
        logger.info(`[Classify] OK: ${result.title} → ${result.type}${isReviewed ? ' (extraction only — item reviewed)' : ''}`)
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(err, `[Classify] DB update failed for ${id}`)
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error(`[Classify] Failed for ${id}, leaving as pending`)
    }

    completed++;
    await updateJobProgress(jobId, completed, itemIds.length).catch(() => {});
    if (completed >= itemIds.length) {
      await completeJob(jobId).catch(() => {});
    }
  }));

  await Promise.all(tasks);
}

router.post('/url', ingestLimiter, async (req, res) => {
  try {
    const { url } = req.body as IngestUrlRequest;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const scraped = await scrapeUrl(url);

    const [preview, embedding] = await Promise.all([
      summarizeAndClassify(scraped),
      embedQuery(scraped.content.slice(0, 2000)),
    ]);

    const similarItems = await findSimilarItems(embedding);
    res.json({ preview, similarItems });
  } catch (error) {
    logger.error(error, 'Ingest URL error')
    res.status(500).json({ error: 'Failed to ingest URL' });
  }
});

router.post('/keep', keepUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const notes = await parseKeepZipAsync(req.file.buffer);
    res.json({ notes });
  } catch (error) {
    logger.error(error, 'Keep ingest error')
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
      const content = note.content || ''
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO items (title, type, content, raw_content, structured, source, reviewed)
         VALUES ($1, $2, $3, $3, $4, $5, $6) RETURNING id`,
        [note.title || 'Untitled', 'note', content, JSON.stringify({}), 'keep', false]
      );
      const itemId = rows[0].id;
      savedIds.push(itemId);
      if (note.labels?.length > 0) await setItemTags(client, itemId, note.labels);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    logger.error(err, 'Bulk Keep insert error')
    return res.status(500).json({ error: 'Failed to save notes to database' });
  }
  client.release();

  const jobId = uuidv4();
  await createJob(jobId, notes.length);

  // Fire and forget — runs in background
  classifyAndUpdateBatch(savedIds, notes, jobId)
    .catch(err => failJob(jobId, String(err)).catch(() => {}));

  logger.info(`[Keep import] Saved ${savedIds.length} notes, background classification started (job ${jobId})`)
  res.json({ saved: savedIds.length, jobId });
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ingest_jobs WHERE id = $1',
      [req.params.id],
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' })
    const row = rows[0]
    const startedMs = new Date(row.started_at).getTime()
    const completedMs = row.completed_at ? new Date(row.completed_at).getTime() : null
    const elapsed = completedMs
      ? ((completedMs - startedMs) / 1000).toFixed(1)
      : ((Date.now() - startedMs) / 1000).toFixed(1)
    res.json({
      status: row.status,
      progress: row.progress,
      total: row.total,
      completed: row.completed,
      startedAt: startedMs,
      completedAt: completedMs ?? undefined,
      elapsed,
    })
  } catch (err) {
    logger.error(err, 'GET /api/ingest/jobs/:id error')
    res.status(500).json({ error: 'Failed to fetch job' })
  }
});

// ── GET /api/ingest/markitdown/health ─────────────────────────────────────────

router.get('/markitdown/health', async (_req, res) => {
  const installed = await checkMarkitdownInstalled();
  res.json({ installed });
});

// ── GET /api/ingest/vision/health — is a vision model available in Ollama? ────

router.get('/vision/health', async (_req, res) => {
  const model = await getAvailableVisionModel();
  res.json({ available: !!model, model: model ?? null });
});

// ── POST /api/ingest/file — image → vision model | document → MarkItDown ──────

router.post('/file', ingestLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { originalname, buffer, mimetype } = req.file;
  const baseName = originalname.replace(/\.[^.]+$/, '');

  // ── Image: run through Ollama vision model ──────────────────────────────────
  if (isImageMime(mimetype)) {
    try {
      const description = await describeImage(buffer, originalname);

      const [classification, embedding] = await Promise.all([
        classify(description),
        embedQuery(description.slice(0, 2000)),
      ]);

      if (!classification.title || classification.title === 'Untitled') {
        classification.title = baseName;
      }

      const similarItems = await findSimilarItems(embedding);
      return res.json({
        preview: {
          title: classification.title,
          type: classification.type,
          content: description,
          structured: { ...classification.structured, summary: classification.summary },
          categories: classification.categories,
          tags: classification.tags,
          source: 'manual',
          visionModel: await getAvailableVisionModel(),
        },
        similarItems,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Vision analysis failed';
      logger.error(err, 'Vision ingest error')
      const status = msg.includes('No vision model') ? 503 : 500;
      return res.status(status).json({ error: msg, code: status === 503 ? 'NO_VISION_MODEL' : undefined });
    }
  }

  // ── Document: run through MarkItDown ────────────────────────────────────────
  if (!SUPPORTED_MIME_TYPES.includes(mimetype) && !originalname.match(/\.(pdf|docx?|pptx?|xlsx?|csv|jpe?g|png|gif|webp|bmp|html?|xml|json|epub|txt|md)$/i)) {
    return res.status(415).json({ error: `Unsupported file type: ${mimetype}` });
  }

  try {
    const markdown = await convertToMarkdown(buffer, originalname);

    if (!markdown.trim()) {
      return res.status(422).json({ error: 'No text could be extracted from this file.' });
    }

    const [classification, embedding] = await Promise.all([
      classify(markdown.slice(0, 3000)),
      embedQuery(markdown.slice(0, 2000)),
    ]);

    if (!classification.title || classification.title === 'Untitled') {
      classification.title = baseName;
    }

    const similarItems = await findSimilarItems(embedding);
    return res.json({
      preview: {
        title: classification.title,
        type: classification.type,
        content: markdown,
        structured: { ...classification.structured, summary: classification.summary },
        categories: classification.categories,
        tags: classification.tags,
        source: 'manual',
      },
      similarItems,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'File conversion failed';
    logger.error(err, 'File ingest error')
    if (msg.includes('not found')) {
      return res.status(503).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/ingest/whisper/health — is the whisper CLI installed? ────────────

router.get('/whisper/health', async (_req, res) => {
  const installed = await checkWhisperInstalled();
  res.json({ installed });
});

// ── POST /api/ingest/voice — transcribe audio → classify → preview ────────────

router.post('/voice', ingestLimiter, audioUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio uploaded' });

  const { originalname, buffer, mimetype } = req.file;

  if (!isAudioMime(mimetype) && !originalname.match(/\.(webm|ogg|wav|mp3|mp4|m4a|flac|aac)$/i)) {
    return res.status(415).json({ error: `Unsupported audio type: ${mimetype}` });
  }

  try {
    const transcript = await transcribeAudio(buffer, originalname || 'recording.webm');

    if (!transcript.trim()) {
      return res.status(422).json({ error: 'No speech could be transcribed from this audio.' });
    }

    const [classification, embedding] = await Promise.all([
      classify(transcript),
      embedQuery(transcript.slice(0, 2000)),
    ]);

    if (!classification.title || classification.title === 'Untitled') {
      classification.title = transcript.split('\n')[0]?.slice(0, 80) || 'Voice Note';
    }

    const similarItems = await findSimilarItems(embedding);
    return res.json({
      preview: {
        title: classification.title,
        type: classification.type,
        content: transcript,
        structured: { ...classification.structured, summary: classification.summary },
        categories: classification.categories,
        tags: classification.tags,
        source: 'manual',
      },
      similarItems,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Transcription failed';
    logger.error(err, 'Voice ingest error')
    const status = msg.includes('not found') ? 503 : 500;
    return res.status(status).json({ error: msg, code: status === 503 ? 'NO_WHISPER' : undefined });
  }
});

// ── POST /api/ingest/quicksave — one-shot: scrape + classify + save (bookmarklet) ──

router.post('/quicksave', ingestLimiter, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const scraped = await scrapeUrl(url);

    const [preview, embedding] = await Promise.all([
      summarizeAndClassify(scraped),
      embedQuery(scraped.content.slice(0, 2000)),
    ]);

    const similarItems = await findSimilarItems(embedding);

    const client = await pool.connect();
    let savedItem;
    try {
      await client.query('BEGIN');
      savedItem = await createItem(client, {
        title: preview.title,
        type: preview.type,
        content: preview.content,
        structured: preview.structured as Record<string, unknown>,
        source: preview.source,
        sourceUrl: preview.sourceUrl,
        categories: preview.categories,
        tags: preview.tags,
        reviewed: false,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Async: embed in background
    embedItem(savedItem.title, savedItem.content)
      .then(v => pool.query('UPDATE items SET embedding=$1 WHERE id=$2', [JSON.stringify(v), savedItem.id]))
      .catch(() => {});

    res.json({
      item: { id: savedItem.id, title: savedItem.title, type: savedItem.type },
      similarItems,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to save';
    logger.error(error, 'Quicksave error')
    res.status(500).json({ error: msg });
  }
});

router.post('/text', ingestLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const [classification, embedding] = await Promise.all([
      classify(text),
      embedQuery(text.slice(0, 2000)),
    ]);

    const similarItems = await findSimilarItems(embedding);
    res.json({
      preview: {
        title: classification.title,
        type: classification.type,
        content: text,
        structured: { ...classification.structured, summary: classification.summary },
        categories: classification.categories,
        tags: classification.tags,
        source: 'manual',
        reviewed: false,
      },
      similarItems,
    });
  } catch (error) {
    logger.error(error, 'Text classification error')
    res.status(500).json({ error: 'Failed to classify text' });
  }
});

export default router;
