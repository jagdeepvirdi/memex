import { YoutubeTranscript } from 'youtube-transcript';
import { getSetting, asBool } from './settings.js';
import logger from '../lib/logger.js'
import { extractYoutubeId } from './youtubeUrl.js'
import { fetchVideoDetails } from './youtubeApi.js'
import { parseGithubRepoUrl } from './githubRepo.js'
import { fetchGithubReadme, GithubLookupError } from './githubApi.js'

export interface ScrapedContent {
  title: string;
  content: string;
  source: 'url' | 'youtube' | 'instagram';
  sourceUrl: string;
  /** YouTube-only fields */
  videoId?: string;
  channel?: string;
  transcript?: string;
  transcriptAvailable?: boolean;
  transcriptTruncated?: boolean;
  /** From the YouTube Data API, only when a key is configured (see youtubeApi.ts). */
  description?: string;
  publishedAt?: string;
  durationSeconds?: number;
  /** Why the transcript (or metadata) could not be fetched, for per-item failure reports. */
  failure?: string;
}

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  // The UI historically saved this as the string 'true'/'false'; asBool() reads both forms.
  const isStrictLocal = asBool(await getSetting<unknown>('strict_local_mode', false));
  if (isStrictLocal) {
    throw new Error('Strict Local Mode is enabled. External URL scraping is blocked.');
  }

  const youtubeId = extractYoutubeId(url);
  if (youtubeId) {
    return scrapeYoutube(url, youtubeId);
  }

  const instagramShortcode = extractInstagramShortcode(url);
  if (instagramShortcode) {
    return scrapeInstagram(url, instagramShortcode);
  }

  return scrapeGeneric(url);
}

/** Max transcript characters kept on an item (long videos are truncated, flagged via `transcriptTruncated`). */
export const MAX_TRANSCRIPT_CHARS = 30_000

// URL helpers live in youtubeUrl.ts (pure, no DB imports); re-exported for existing callers.
export { extractYoutubeId, findYoutubeUrl, findYoutubeUrls } from './youtubeUrl.js'

export function extractInstagramShortcode(url: string): string | null {
  const regex = /(?:instagram\.com\/(?:p|reels|tv)\/)([^\/\?#\s]+)/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Prefers the English caption track. Without a language the library takes whichever track YouTube lists
 * first, which for many videos is an arbitrary auto-translation (a TEDx talk came back in Chinese, a
 * Turkish recipe in Afrikaans). Falls back to the default track only when English is not offered; any
 * other failure (captions disabled, video unavailable) is not retried.
 */
async function fetchTranscriptParts(videoId: string) {
  try {
    return await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
  } catch (err) {
    if (err instanceof Error && /No transcripts are available in/i.test(err.message)) {
      return await YoutubeTranscript.fetchTranscript(videoId)
    }
    throw err
  }
}

async function scrapeYoutube(url: string, videoId: string): Promise<ScrapedContent> {
  const canonical = `https://www.youtube.com/watch?v=${videoId}`
  let title = `YouTube Video (${videoId})`
  let channel: string | undefined
  let metadataFailure: string | undefined

  // Metadata and transcript are independent: losing one must not lose the other.
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`)
    if (!res.ok) throw new Error(`oEmbed HTTP ${res.status} (private, removed or age-gated?)`)
    const data = await res.json() as { title?: string; author_name?: string }
    if (data.title) title = data.title
    channel = data.author_name || undefined
  } catch (error) {
    metadataFailure = error instanceof Error ? error.message : String(error)
    logger.error(error, 'YouTube oEmbed error')
  }

  // The description (YouTube Data API, optional) is fetched alongside the transcript. It never throws.
  const detailsPromise = fetchVideoDetails(videoId)

  let transcript: string | undefined
  let transcriptTruncated = false
  let transcriptError: string | undefined
  try {
    const parts = await fetchTranscriptParts(videoId)
    const full = parts.map(p => p.text).join(' ').trim()
    if (!full) throw new Error('Transcript was empty')
    transcriptTruncated = full.length > MAX_TRANSCRIPT_CHARS
    transcript = transcriptTruncated ? full.slice(0, MAX_TRANSCRIPT_CHARS) : full
  } catch (error) {
    transcriptError = error instanceof Error ? error.message : String(error)
    logger.error(error, 'YouTube transcript error')
  }

  const details = await detailsPromise
  channel = channel ?? details?.channelTitle
  const description = details?.description || undefined

  const transcriptAvailable = transcript !== undefined
  // Without a transcript, give the classifier title + channel (+ description when we have one) rather than a bare placeholder.
  const content = transcript ?? [title, channel && `Channel: ${channel}`, description?.slice(0, 2000), 'Transcript unavailable.'].filter(Boolean).join('\n')

  return {
    title,
    content,
    source: 'youtube',
    sourceUrl: url,
    videoId,
    channel,
    transcript,
    transcriptAvailable,
    transcriptTruncated,
    description,
    publishedAt: details?.publishedAt,
    durationSeconds: details?.durationSeconds,
    failure: transcriptAvailable ? undefined : (transcriptError ?? metadataFailure),
  }
}

async function scrapeInstagram(url: string, shortcode: string): Promise<ScrapedContent> {
  try {
    const oEmbedRes = await fetch(`https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`);
    if (oEmbedRes.ok) {
      const data = await oEmbedRes.json() as { title: string; author_name: string };
      return {
        title: data.title || `Instagram post by ${data.author_name}`,
        content: data.title || 'Instagram content',
        source: 'instagram',
        sourceUrl: url
      };
    }
    
    return {
      title: `Instagram Post (${shortcode})`,
      content: 'Instagram content details limited.',
      source: 'instagram',
      sourceUrl: url
    };
  } catch (error) {
    logger.error(error, 'Instagram scrape error')
    return {
      title: `Instagram Post (${shortcode})`,
      content: 'Instagram content unavailable.',
      source: 'instagram',
      sourceUrl: url
    };
  }
}

/** A repo page Jina could not read: use the README from GitHub's API instead. Null on any problem. */
async function githubReadmeFallback(url: string): Promise<ScrapedContent | null> {
  const ref = parseGithubRepoUrl(url)
  if (!ref) return null
  try {
    const readme = await fetchGithubReadme(`${ref.owner}/${ref.repo}`)
    return {
      title: `${ref.owner}/${ref.repo}`,
      content: `# ${ref.owner}/${ref.repo}\n\n${readme}`,
      source: 'url',
      sourceUrl: url,
    }
  } catch (error) {
    logger.warn({ kind: error instanceof GithubLookupError ? error.kind : 'error' }, 'GitHub README fallback failed')
    return null
  }
}

async function scrapeGeneric(url: string): Promise<ScrapedContent> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Jina error: ${response.statusText}`);
    }

    const data = await response.json() as { data: { title: string; content: string } };

    // Jina answered but found nothing on a repo page: the README is the content.
    if (!data.data.content?.trim()) {
      const readme = await githubReadmeFallback(url)
      if (readme) return readme
    }

    return {
      title: data.data.title || url,
      content: data.data.content || '',
      source: 'url',
      sourceUrl: url
    };
  } catch (error) {
    logger.error(error, 'Generic scrape error')
    const readme = await githubReadmeFallback(url)
    if (readme) return readme
    return {
      title: url,
      content: 'Failed to extract content from this URL.',
      source: 'url',
      sourceUrl: url
    };
  }
}
