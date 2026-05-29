import { classify } from './classifier.js';
import type { ScrapedContent } from './scraper.js';
import type { IngestUrlResponse } from '../../../shared/types.js';

export async function summarizeAndClassify(scraped: ScrapedContent): Promise<IngestUrlResponse['preview']> {
  // Use the AI to classify the scraped content
  // We pass the scraped title as a hint if the content is sparse
  const textToClassify = `Title: ${scraped.title}\n\nContent: ${scraped.content}`;
  const result = await classify(textToClassify);

  // For 'link' types (url, youtube, instagram), we store the summary in 'structured' 
  // so the UI can display it easily, as seen in LinkCard.tsx
  const structuredWithSummary = {
    ...result.structured,
    summary: result.summary
  };

  return {
    title: result.title || scraped.title,
    type: result.type,
    content: scraped.content,
    structured: structuredWithSummary,
    categories: result.categories,
    tags: result.tags,
    source: scraped.source,
    sourceUrl: scraped.sourceUrl,
    reviewed: false,
  };
}
