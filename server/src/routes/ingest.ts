import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { scrapeUrl } from '../services/scraper.js';
import { summarizeAndClassify } from '../services/summarizer.js';
import { parseKeepZip } from '../services/keepImporter.js';
import { classifyNotesBatch } from '../services/batchClassifier.js';
import { classify } from '../services/classifier.js';
import type { IngestUrlRequest, ApiError } from '../../../shared/types.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// In-memory job store
const jobs: Record<string, { status: 'processing' | 'completed' | 'failed', progress: number, results?: any[], error?: string }> = {};

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
  res.json(job);
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
