import pLimit from 'p-limit';
import { classify } from './classifier.js';
import type { KeepNote } from './keepImporter.js';
import type { Item, ItemType } from '../../../shared/types.js';

const limit = pLimit(3); // Max 3 concurrent Ollama calls

export interface BatchProgress {
  total: number;
  completed: number;
  results: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'>[];
}

export async function classifyNotesBatch(
  notes: KeepNote[], 
  onProgress?: (progress: BatchProgress) => void
): Promise<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'>[]> {
  const total = notes.length;
  let completed = 0;
  const results: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'>[] = [];

  const tasks = notes.map(note => limit(async () => {
    try {
      const textToClassify = `Title: ${note.title}\n\nContent: ${note.content}`;
      const classification = await classify(textToClassify);

      const result = {
        title: classification.title || note.title || 'Untitled',
        type: classification.type as ItemType,
        content: note.content,
        structured: {
          ...classification.structured,
          summary: classification.summary
        },
        categories: classification.categories,
        // Merge AI tags with Keep labels
        tags: Array.from(new Set([...classification.tags, ...note.labels])),
        source: note.source,
      };

      results.push(result);
      completed++;
      
      onProgress?.({
        total,
        completed,
        results
      });

      return result;
    } catch (error) {
      console.error(`Batch classification failed for note: ${note.title}`, error);
      // Fallback to note type
      const fallback = {
        title: note.title || 'Untitled',
        type: 'note' as ItemType,
        content: note.content,
        structured: {},
        categories: [],
        tags: note.labels,
        source: note.source,
      };
      results.push(fallback);
      completed++;
      onProgress?.({ total, completed, results });
      return fallback;
    }
  }));

  await Promise.all(tasks);
  return results;
}
