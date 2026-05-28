import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { ItemSource } from '../../../shared/types.js';

export interface KeepNote {
  title: string;
  content: string;
  labels: string[];
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
        const updatedAt = data.userEditedTimestampUsec 
          ? new Date(data.userEditedTimestampUsec / 1000) 
          : new Date();

        // Deduplicate by content hash
        const hash = crypto.createHash('md5').update(title + textContent).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        notes.push({
          title,
          content: textContent,
          labels,
          updatedAt,
          source: 'keep'
        });
      } catch (error) {
        console.error(`Failed to parse Keep note ${entry.entryName}:`, error);
      }
    }
  }

  return notes;
}
