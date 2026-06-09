import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import type { ItemSource } from '../../../shared/types.js';
import logger from '../lib/logger.js'

export interface KeepNote {
  title: string;
  content: string;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  source: ItemSource;
}

export function parseKeepZip(buffer: Buffer): KeepNote[] {
  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();
  const notes: KeepNote[] = [];
  const seenHashes = new Set<string>();

  for (const entry of zipEntries) {
    // Google Takeout stores notes at Keep/*.json or Takeout/Keep/*.json
    const isKeepJson =
      (entry.entryName.startsWith('Keep/') || entry.entryName.includes('/Keep/')) &&
      entry.entryName.endsWith('.json')
    if (isKeepJson) {
      try {
        const content = entry.getData().toString('utf8');
        const data = JSON.parse(content);

        // Extract relevant fields
        const title = data.title || '';
        const textContent = data.textContent || '';
        
        // Skip empty notes
        if (!title && !textContent) continue;

        const labels = (data.labels || []).map((l: { name: string }) => l.name);

        // Convert microseconds to milliseconds
        const now = new Date();
        const createdAt = data.createdTimestampUsec
          ? new Date(data.createdTimestampUsec / 1000)
          : now;
        const updatedAt = data.userEditedTimestampUsec
          ? new Date(data.userEditedTimestampUsec / 1000)
          : now;

        // Deduplicate by content hash
        const hash = crypto.createHash('md5').update(title + textContent).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        notes.push({
          title,
          content: textContent,
          labels,
          createdAt,
          updatedAt,
          source: 'keep'
        });
      } catch (error) {
        logger.error(error, `Failed to parse Keep note ${entry.entryName}`)
      }
    }
  }

  return notes;
}

const workerCode = `
const { parentPort, workerData } = require('worker_threads');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

try {
  const { buffer } = workerData;
  const zip = new AdmZip(Buffer.from(buffer));
  const zipEntries = zip.getEntries();
  const notes = [];
  const seenHashes = new Set();

  for (const entry of zipEntries) {
    const isKeepJson =
      (entry.entryName.startsWith('Keep/') || entry.entryName.includes('/Keep/')) &&
      entry.entryName.endsWith('.json');
    if (isKeepJson) {
      try {
        const content = entry.getData().toString('utf8');
        const data = JSON.parse(content);

        const title = data.title || '';
        const textContent = data.textContent || '';
        
        if (!title && !textContent) continue;

        const labels = (data.labels || []).map((l) => l.name);

        const now = new Date().toISOString();
        const createdAt = data.createdTimestampUsec
          ? new Date(data.createdTimestampUsec / 1000).toISOString()
          : now;
        const updatedAt = data.userEditedTimestampUsec
          ? new Date(data.userEditedTimestampUsec / 1000).toISOString()
          : now;

        const hash = crypto.createHash('md5').update(title + textContent).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        notes.push({
          title,
          content: textContent,
          labels,
          createdAt,
          updatedAt,
          source: 'keep'
        });
      } catch (err) {
        // ignore note-level parsing error
      }
    }
  }
  parentPort.postMessage({ notes });
} catch (error) {
  parentPort.postMessage({ error: error.message || String(error) });
}
`;

export function parseKeepZipAsync(buffer: Buffer): Promise<KeepNote[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { buffer },
    });
    worker.on('message', (message) => {
      if (message.error) {
        reject(new Error(message.error));
      } else {
        // Re-hydrate Date objects after cloning across thread boundary
        const notes = (message.notes as any[]).map((n) => ({
          ...n,
          createdAt: new Date(n.createdAt),
          updatedAt: new Date(n.updatedAt),
        }));
        resolve(notes);
      }
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}


