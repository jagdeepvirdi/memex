import { classify } from './classifier.js';
import type { ScrapedContent } from './scraper.js';
import type { IngestUrlResponse } from '../../../shared/types.js';

/** Transcript characters sent to the classifier: head + middle + tail keeps a small local model's prompt bounded. */
const EXCERPT_HEAD = 4000;
const EXCERPT_MIDDLE = 1000;
const EXCERPT_TAIL = 1000;
const DESCRIPTION_EXCERPT = 1500;

export function excerptTranscript(transcript: string): string {
  const max = EXCERPT_HEAD + EXCERPT_MIDDLE + EXCERPT_TAIL;
  if (transcript.length <= max) return transcript;
  const mid = Math.floor(transcript.length / 2);
  return [
    transcript.slice(0, EXCERPT_HEAD),
    transcript.slice(mid - EXCERPT_MIDDLE / 2, mid + EXCERPT_MIDDLE / 2),
    transcript.slice(-EXCERPT_TAIL),
  ].join('\n[…]\n');
}

export function buildYoutubeClassifierText(scraped: ScrapedContent): string {
  const lines = [`Title: ${scraped.title}`];
  if (scraped.channel) lines.push(`Channel: ${scraped.channel}`);
  // The description names the dish / tool / topic far more reliably than a transcript excerpt does.
  if (scraped.description) lines.push('', `Description:\n${scraped.description.slice(0, DESCRIPTION_EXCERPT)}`);
  lines.push(
    '',
    scraped.transcriptAvailable && scraped.transcript
      ? `Transcript excerpt${scraped.transcriptTruncated || scraped.transcript.length > EXCERPT_HEAD + EXCERPT_MIDDLE + EXCERPT_TAIL ? ' (long video, abridged)' : ''}:\n${excerptTranscript(scraped.transcript)}`
      : 'Transcript unavailable.',
  );
  return lines.join('\n');
}

export async function summarizeAndClassify(scraped: ScrapedContent): Promise<IngestUrlResponse['preview']> {
  const isVideo = scraped.source === 'youtube';
  // Use the AI to classify the scraped content
  // We pass the scraped title as a hint if the content is sparse
  const textToClassify = isVideo ? buildYoutubeClassifierText(scraped) : `Title: ${scraped.title}\n\nContent: ${scraped.content}`;
  // The saved URL lets the classifier recognise a GitHub repo page as the subject of the item
  const result = await classify(textToClassify, {
    sourceUrl: scraped.sourceUrl,
    ...(isVideo && {
      video: { videoId: scraped.videoId, channel: scraped.channel, transcriptAvailable: scraped.transcriptAvailable ?? false },
    }),
  });

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
    confidence: result.confidence,
    intent: result.intent,
    reviewed: false,
  };
}
