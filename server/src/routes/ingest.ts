import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { scrapeUrl } from '../services/scraper.js';
import { summarizeAndClassify } from '../services/summarizer.js';
import { detectPasteSource } from '../services/sourceDetect.js';
import { parseKeepZipAsync } from '../services/keepImporter.js';
import { classifyAndUpdateBatch } from '../services/enrichBatch.js'
import { splitPaste, planPaste, savePlanned, MAX_PASTE_ENTRIES, MAX_PASTE_CHARS, type PasteEntryResult } from '../services/pasteImport.js'
import { readMarkdownUpload, planMarkdown, saveMarkdownNotes, MAX_MARKDOWN_ENTRIES } from '../services/markdownImport.js'
import { readBookmarkUpload, planBookmarks, saveBookmarks, bookmarkContent, FROM_BOOKMARKS_TAG, MAX_BOOKMARKS } from '../services/bookmarkImport.js'
import { classify, classifyBatch } from '../services/classifier.js';
import { convertToMarkdown, checkMarkitdownInstalled, SUPPORTED_MIME_TYPES } from '../services/markitdown.js';
import { describeImage, getAvailableVisionModel, isImageMime } from '../services/visionService.js';
import { transcribeAudio, checkWhisperInstalled, isAudioMime } from '../services/whisperService.js';
import { findSimilarItems, findItemsBySourceUrl, findItemsByExactText, mergeSimilar } from '../services/duplicateService.js';
import { embedForDuplicateCheck } from '../services/embedder.js';
import { pool } from '../db/client.js';
import { setItemTags } from '../db/helpers.js';
import { quickSaveUrl } from '../services/quickSave.js';
import { cloudSafe } from '../services/cloudSafe.js';
import { placesForCapture } from '../services/notePlaces.js';
import type { MinedPlace } from '../services/placeMining.js';
import type { IngestUrlRequest } from '../../../shared/types.js';
import logger from '../lib/logger.js'
import { createJob, saveJobDetails, failJob, hasRunningJob, cancelJob } from '../services/ingestJobs.js'
import { cancelRunningJob, isCancellableJobKind } from '../services/jobControl.js'
import { z } from 'zod'
import { getSetting, asBool } from '../services/settings.js'
import { loadBackfillPlan, previewSample, runBackfill, BACKFILL_KIND, DELAY_MIN_MS, DELAY_MAX_MS } from '../services/youtubeBackfill.js'

/** How much of a scraped web page is read for places (a list article puts its places far down). */
const URL_PLACE_CHARS = 8000;

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

router.post('/url', ingestLimiter, async (req, res) => {
  try {
    const { url } = req.body as IngestUrlRequest;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const scraped = await scrapeUrl(url);

    const [preview, embedding] = await Promise.all([
      summarizeAndClassify(scraped),
      embedForDuplicateCheck(scraped.content.slice(0, 2000)),
    ]);

    // Same page saved before (any URL spelling) is listed first, then near-duplicate content.
    const [sameUrl, similar] = await Promise.all([findItemsBySourceUrl(url), findSimilarItems(embedding)]);

    // A web article about a trip ("things to do in X") offers its places too. Not for videos (a transcript is noisy).
    const found = preview.source === 'url'
      ? await placesForCapture({ ...preview, structured: preview.structured as Record<string, unknown> }, scraped.content, { maxChars: URL_PLACE_CHARS, scanContent: false, page: true })
      : { places: [] as MinedPlace[], model: undefined };

    res.json({
      preview: { ...preview, ...(found.places.length > 0 ? { places: found.places, placesModel: found.model } : {}) },
      similarItems: mergeSimilar(sameUrl, similar),
    });
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
      const noteCreatedAt = note.createdAt ? new Date(note.createdAt) : new Date();
      const noteUpdatedAt = note.updatedAt ? new Date(note.updatedAt) : noteCreatedAt;
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO items (title, type, content, raw_content, structured, source, reviewed, created_at, updated_at)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [note.title || 'Untitled', 'note', content, JSON.stringify({}), 'keep', false, noteCreatedAt, noteUpdatedAt]
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
  classifyAndUpdateBatch(
    savedIds,
    notes.map((n: { title?: string; content?: string; labels?: string[] }) => ({ title: n.title, content: n.content, labels: n.labels, source: 'keep' as const })),
    jobId,
  )
    .catch(err => failJob(jobId, String(err)).catch(() => {}));

  logger.info(`[Keep import] Saved ${savedIds.length} notes, background classification started (job ${jobId})`)
  res.json({ saved: savedIds.length, jobId });
});

// ── POST /api/ingest/paste/bulk ───────────────────────────────────────────────
// Paste many links / captions / snippets at once. Entries are split, de-duplicated (same URL in the
// paste or already saved, ignoring tracking params and spelling), saved instantly as unreviewed notes,
// then classified in the background — poll GET /jobs/:id. `dryRun` returns the plan and writes nothing.

const PASTE_KIND = 'paste-import'

const pasteBulkSchema = z
  .object({
    text: z.string().max(MAX_PASTE_CHARS).optional(),
    entries: z.array(z.object({ text: z.string() })).optional(),
    dryRun: z.boolean().default(false),
  })
  .refine(b => (b.text !== undefined) !== (b.entries !== undefined), { message: 'Send either "text" or "entries"' })

router.post('/paste/bulk', ingestLimiter, async (req, res) => {
  const parsed = pasteBulkSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
  const { dryRun } = parsed.data

  const texts = parsed.data.entries
    ? parsed.data.entries.map(e => e.text.trim()).filter(Boolean)
    : splitPaste(parsed.data.text ?? '')
  if (texts.length === 0) return res.status(400).json({ error: 'Nothing to import — the paste was empty.' })
  if (texts.length > MAX_PASTE_ENTRIES) {
    return res.status(400).json({
      error: `Too many entries (${texts.length}). Import at most ${MAX_PASTE_ENTRIES} at a time.`,
      max: MAX_PASTE_ENTRIES,
    })
  }

  try {
    if (!dryRun && (await hasRunningJob(PASTE_KIND))) {
      return res.status(409).json({ error: 'A paste import is already running. Wait for it to finish.' })
    }

    const planned = await planPaste(texts)
    const toSave = planned.filter(e => e.status === 'new')
    const counts = { total: planned.length, new: toSave.length, skipped: planned.length - toSave.length }
    const toResult = (e: (typeof planned)[number], itemId?: string): PasteEntryResult => ({
      index: e.index,
      title: e.title,
      source: e.source,
      sourceUrl: e.sourceUrl,
      status: e.status === 'new' ? 'saved' : 'skipped',
      reason: e.reason,
      itemId,
      existingId: e.existingId,
      existingTitle: e.existingTitle,
    })

    if (dryRun) {
      return res.json({ dryRun: true, ...counts, entries: planned.map(e => toResult(e)) })
    }
    if (toSave.length === 0) {
      return res.json({ dryRun: false, ...counts, saved: 0, jobId: null, entries: planned.map(e => toResult(e)) })
    }

    const client = await pool.connect()
    let ids: string[]
    try {
      await client.query('BEGIN')
      ids = await savePlanned(client, toSave)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    const idByIndex = new Map(toSave.map((e, i) => [e.index, ids[i]]))
    const entries = planned.map(e => toResult(e, idByIndex.get(e.index)))

    const jobId = uuidv4()
    await createJob(jobId, ids.length, PASTE_KIND)
    await saveJobDetails(jobId, { entries }).catch(() => {})

    // Fire and forget — classification continues after the response.
    classifyAndUpdateBatch(
      ids,
      toSave.map(e => ({ content: e.text, source: e.source, sourceUrl: e.sourceUrl })),
      jobId,
      { details: { entries } },
    ).catch(err => failJob(jobId, String(err)).catch(() => {}))

    logger.info(`[Paste import] Saved ${ids.length} of ${planned.length} entries, classification started (job ${jobId})`)
    res.json({ dryRun: false, ...counts, saved: ids.length, jobId, entries })
  } catch (err) {
    logger.error(err, 'Paste bulk import error')
    res.status(500).json({ error: 'Failed to import pasted entries' })
  }
})


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
      ...(row.error ? { error: row.error } : {}),
      ...(row.details ? { details: row.details } : {}),
    })
  } catch (err) {
    logger.error(err, 'GET /api/ingest/jobs/:id error')
    res.status(500).json({ error: 'Failed to fetch job' })
  }
});

// ── POST /api/ingest/jobs/:id/cancel — stop a running Explain / Extract recipe job ──────────────
// 202 { status: 'cancelling' } when its runner was told to stop (the job row turns 'cancelled' a moment later, once the
// model call has been aborted); 200 { status: 'cancelled' } when no runner exists any more (server restarted) and the
// stale row was just cleared. Finished jobs keep their outcome (409); other kinds of job cannot be cancelled (400).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

router.post('/jobs/:id/cancel', async (req, res) => {
  const id = String(req.params.id)
  if (!UUID.test(id)) return res.status(404).json({ error: 'Job not found' })
  try {
    const { rows } = await pool.query<{ status: string; kind: string | null }>('SELECT status, kind FROM ingest_jobs WHERE id = $1', [id])
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' })
    const { status, kind } = rows[0]
    if (!isCancellableJobKind(kind)) return res.status(400).json({ error: 'This kind of job cannot be cancelled.' })
    if (status !== 'processing') return res.status(409).json({ error: 'This job has already finished.', status })

    if (cancelRunningJob(id)) return res.status(202).json({ status: 'cancelling' })

    // Nothing is running it (the server restarted mid-job): clear the stale row so it stops blocking new jobs.
    await cancelJob(id)
    res.json({ status: 'cancelled' })
  } catch (err) {
    logger.error(err, 'POST /api/ingest/jobs/:id/cancel error')
    res.status(500).json({ error: 'Failed to cancel the job' })
  }
})

// ── POST /api/ingest/youtube/backfill ─────────────────────────────────────────
// Re-reads existing items that are (just) a YouTube link: sets source_url, fetches
// title/channel/transcript, re-classifies with the video hint and writes through the
// versioned item_extractions path. Reviewed items and long notes are never touched.
// dryRun (default) writes nothing; `preview: N` fetches + classifies N sample items.

const backfillSchema = z.object({
  dryRun: z.boolean().default(true),
  preview: z.number().int().min(0).max(5).default(0),
})

router.post('/youtube/backfill', async (req, res) => {
  const parsed = backfillSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
  const { dryRun, preview } = parsed.data

  try {
    if (asBool(await getSetting<unknown>('strict_local_mode', false))) {
      return res.status(409).json({ error: 'Strict Local Mode is on — YouTube fetching is blocked.' })
    }

    const plan = await loadBackfillPlan()

    if (dryRun) {
      const samples = preview > 0 ? await previewSample(plan.candidates.slice(0, preview), new Map()) : []
      const perItemSeconds = (DELAY_MIN_MS + DELAY_MAX_MS) / 2000 + 8 // delay + fetch + local classify (rough)
      return res.json({
        dryRun: true,
        counts: {
          candidates: plan.candidates.length,
          skipped: plan.skipped.length,
          duplicates: plan.duplicates.length,
        },
        estimateSeconds: Math.round(plan.candidates.length * perItemSeconds),
        candidates: plan.candidates,
        skipped: plan.skipped,
        duplicates: plan.duplicates,
        samples,
      })
    }

    if (await hasRunningJob(BACKFILL_KIND)) {
      return res.status(409).json({ error: 'A YouTube backfill is already running.' })
    }
    if (plan.candidates.length === 0) {
      return res.json({ dryRun: false, jobId: null, total: 0, skipped: plan.skipped, duplicates: plan.duplicates })
    }

    const jobId = uuidv4()
    await createJob(jobId, plan.candidates.length, BACKFILL_KIND)
    // Fire and forget — progress via GET /api/ingest/jobs/:id (details = per-item results)
    runBackfill(jobId, plan).catch((err) => logger.error(err, `[YT backfill] job ${jobId} crashed`))
    logger.info(`[YT backfill] started job ${jobId}: ${plan.candidates.length} items`)
    res.status(202).json({ dryRun: false, jobId, total: plan.candidates.length, skipped: plan.skipped.length, duplicates: plan.duplicates.length })
  } catch (err) {
    logger.error(err, 'POST /api/ingest/youtube/backfill error')
    res.status(500).json({ error: 'Failed to run YouTube backfill' })
  }
})

// ── POST /api/ingest/markdown ─────────────────────────────────────────────────
// Import a zipped folder of Markdown notes (an Obsidian vault) or one .md file. One note per file; frontmatter title/tags/
// created and inline #tags are kept, wikilinks stay as text, hidden folders (.obsidian, .trash) are skipped, duplicates
// (inside the zip or already saved) are skipped. Notes are saved instantly as unreviewed notes and classified in the
// background (poll GET /jobs/:id). Multipart: `file` and optional `dryRun=true`, which returns the plan and writes nothing.
// Nothing is sent to any AI service here; classification afterwards follows the normal provider and privacy settings.

const MARKDOWN_KIND = 'markdown-import'

router.post('/markdown', ingestLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Send a .zip of your notes folder or a single .md file.' })
  const dryRun = String(req.body?.dryRun ?? '').toLowerCase() === 'true'

  let read: ReturnType<typeof readMarkdownUpload>
  try {
    read = readMarkdownUpload(req.file.buffer, req.file.originalname)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Could not read the file.' })
  }
  if (read.notes.length === 0) {
    return res.status(400).json({ error: 'No Markdown notes found (looked for .md, .markdown and .txt files, ignoring hidden folders).', skippedFiles: read.skipped.length })
  }

  try {
    if (!dryRun && (await hasRunningJob(MARKDOWN_KIND))) {
      return res.status(409).json({ error: 'A Markdown import is already running. Wait for it to finish.' })
    }
    const planned = await planMarkdown(read.notes)
    const toSave = planned.filter(n => n.status === 'new')
    const counts = { total: planned.length, new: toSave.length, skipped: planned.length - toSave.length, otherFilesIgnored: read.skipped.length, max: MAX_MARKDOWN_ENTRIES }
    const toResult = (n: (typeof planned)[number], itemId?: string) => ({
      index: n.index, path: n.path, title: n.title, tags: n.tags,
      status: n.status === 'new' ? 'saved' : 'skipped', reason: n.reason, itemId, existingId: n.existingId,
    })

    if (dryRun) return res.json({ dryRun: true, ...counts, entries: planned.map(n => toResult(n)) })
    if (toSave.length === 0) return res.json({ dryRun: false, ...counts, saved: 0, jobId: null, entries: planned.map(n => toResult(n)) })

    const client = await pool.connect()
    let ids: string[]
    try {
      await client.query('BEGIN')
      ids = await saveMarkdownNotes(client, toSave, setItemTags)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    const idByIndex = new Map(toSave.map((n, i) => [n.index, ids[i]]))
    const entries = planned.map(n => toResult(n, idByIndex.get(n.index)))
    const jobId = uuidv4()
    await createJob(jobId, ids.length, MARKDOWN_KIND)
    await saveJobDetails(jobId, { entries }).catch(() => {})
    classifyAndUpdateBatch(
      ids,
      toSave.map(n => ({ title: n.title, content: n.body, labels: n.tags, source: 'manual' as const })),
      jobId,
      { details: { entries } },
    ).catch(err => failJob(jobId, String(err)).catch(() => {}))

    logger.info(`[Markdown import] Saved ${ids.length} of ${planned.length} notes, classification started (job ${jobId})`)
    res.json({ dryRun: false, ...counts, saved: ids.length, jobId, entries })
  } catch (err) {
    logger.error(err, 'Markdown import error')
    res.status(500).json({ error: 'Failed to import the Markdown notes' })
  }
})

// ── POST /api/ingest/bookmarks ────────────────────────────────────────────────
// Import saved links from a browser bookmarks export (.html from Chrome, Edge, Firefox, Safari), Pocket (.html) or Raindrop
// (.html or .csv). One link item per bookmark; folder names and tags become tags; duplicates (in the file or already saved)
// are skipped. NO page is fetched and nothing is sent anywhere here: links are saved with title + address and classified in
// the background (poll GET /jobs/:id) under the usual provider and privacy settings. Multipart: `file`, optional `dryRun=true`.

const BOOKMARK_KIND = 'bookmark-import'

router.post('/bookmarks', ingestLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Send the bookmarks .html (or Raindrop .csv) export.' })
  const dryRun = String(req.body?.dryRun ?? '').toLowerCase() === 'true'

  let parsed: ReturnType<typeof readBookmarkUpload>
  try {
    parsed = readBookmarkUpload(req.file.buffer, req.file.originalname)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Could not read the file.' })
  }
  if (parsed.length === 0) return res.status(400).json({ error: 'No bookmarks found in that file.' })

  try {
    if (!dryRun && (await hasRunningJob(BOOKMARK_KIND))) {
      return res.status(409).json({ error: 'A bookmark import is already running. Wait for it to finish.' })
    }
    const planned = await planBookmarks(parsed)
    const toSave = planned.filter(b => b.status === 'new')
    const counts = { total: planned.length, new: toSave.length, skipped: planned.length - toSave.length, max: MAX_BOOKMARKS }
    const toResult = (b: (typeof planned)[number], itemId?: string) => ({
      index: b.index, url: b.url, title: b.title, tags: b.tags, folder: b.folder,
      status: b.status === 'new' ? 'saved' : 'skipped', reason: b.reason, itemId, existingId: b.existingId,
    })

    if (dryRun) return res.json({ dryRun: true, ...counts, entries: planned.map(b => toResult(b)) })
    if (toSave.length === 0) return res.json({ dryRun: false, ...counts, saved: 0, jobId: null, entries: planned.map(b => toResult(b)) })

    const client = await pool.connect()
    let ids: string[]
    try {
      await client.query('BEGIN')
      ids = await saveBookmarks(client, toSave, setItemTags)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    const idByIndex = new Map(toSave.map((b, i) => [b.index, ids[i]]))
    const entries = planned.map(b => toResult(b, idByIndex.get(b.index)))
    const jobId = uuidv4()
    await createJob(jobId, ids.length, BOOKMARK_KIND)
    await saveJobDetails(jobId, { entries }).catch(() => {})
    classifyAndUpdateBatch(
      ids,
      toSave.map(b => ({ title: b.title, content: bookmarkContent(b), labels: [FROM_BOOKMARKS_TAG, ...b.tags], source: 'url' as const, sourceUrl: b.url })),
      jobId,
      { details: { entries } },
    ).catch(err => failJob(jobId, String(err)).catch(() => {}))

    logger.info(`[Bookmark import] Saved ${ids.length} of ${planned.length} bookmarks, classification started (job ${jobId})`)
    res.json({ dryRun: false, ...counts, saved: ids.length, jobId, entries })
  } catch (err) {
    logger.error(err, 'Bookmark import error')
    res.status(500).json({ error: 'Failed to import the bookmarks' })
  }
})

// ── GET /api/ingest/markitdown/health ─────────────────────────────────────────

router.get('/markitdown/health', async (_req, res) => {
  const installed = await checkMarkitdownInstalled();
  // `inDocker`: the official image has no Python, so the pip install the UI suggests cannot work there.
  res.json({ installed, inDocker: process.env.MEMEX_IN_DOCKER === '1' });
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
        embedForDuplicateCheck(description.slice(0, 2000)),
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
          confidence: classification.confidence,
          intent: classification.intent,
          reviewed: false,
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
      embedForDuplicateCheck(markdown.slice(0, 2000)),
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
        confidence: classification.confidence,
        intent: classification.intent,
        reviewed: false,
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
  res.json({ installed, inDocker: process.env.MEMEX_IN_DOCKER === '1' });
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
      embedForDuplicateCheck(transcript.slice(0, 2000)),
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
        confidence: classification.confidence,
        intent: classification.intent,
        reviewed: false,
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
    res.json(await quickSaveUrl(url));
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

    // Pasted text keeps its provenance: an Instagram caption is `instagram`, a bare repo link
    // is `url` with sourceUrl set, anything else stays `manual`.
    const { source, sourceUrl } = detectPasteSource(text);

    const [classification, embedding] = await Promise.all([
      classify(text, { sourceUrl }),
      embedForDuplicateCheck(text.slice(0, 2000)),
    ]);

    const [sameUrl, sameText, similar] = await Promise.all([
      sourceUrl ? findItemsBySourceUrl(sourceUrl) : Promise.resolve([]),
      findItemsByExactText(text),
      findSimilarItems(embedding),
    ]);
    const similarItems = mergeSimilar(sameUrl, sameText, similar);

    // Places named in the note ("stay at X, eat at Y") are offered as their own entries; the client sends the ones
    // the user keeps back with the save. Failure-soft: no places is the old behaviour.
    const found = await placesForCapture(classification, text);
    const places = found.places;
    const placesModel = found.model;

    res.json({
      preview: {
        title: classification.title,
        type: classification.type,
        content: text,
        structured: { ...classification.structured, summary: classification.summary },
        categories: classification.categories,
        tags: classification.tags,
        source,
        sourceUrl,
        confidence: classification.confidence,
        intent: classification.intent,
        reviewed: false,
        ...(places.length > 0 ? { places, placesModel } : {}),
      },
      similarItems,
    });
  } catch (error) {
    logger.error(error, 'Text classification error')
    res.status(500).json({ error: 'Failed to classify text' });
  }
});

export default router;
