import { YoutubeTranscript } from 'youtube-transcript';
import { getSetting } from './settings.js';

export interface ScrapedContent {
  title: string;
  content: string;
  source: 'url' | 'youtube' | 'instagram';
  sourceUrl: string;
}

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  const isStrictLocal = await getSetting('strict_local_mode', false);
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

export function extractYoutubeId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

export function extractInstagramShortcode(url: string): string | null {
  const regex = /(?:instagram\.com\/(?:p|reels|tv)\/)([^\/\?#\s]+)/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function scrapeYoutube(url: string, videoId: string): Promise<ScrapedContent> {
  try {
    const oEmbedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    const oEmbedData = await oEmbedRes.json() as { title: string };
    const title = oEmbedData.title || `YouTube Video (${videoId})`;

    const transcriptParts = await YoutubeTranscript.fetchTranscript(videoId);
    const content = transcriptParts.map(p => p.text).join(' ');

    return {
      title,
      content,
      source: 'youtube',
      sourceUrl: url
    };
  } catch (error) {
    console.error('YouTube scrape error:', error);
    return {
      title: `YouTube Video (${videoId})`,
      content: 'Transcript unavailable.',
      source: 'youtube',
      sourceUrl: url
    };
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
    console.error('Instagram scrape error:', error);
    return {
      title: `Instagram Post (${shortcode})`,
      content: 'Instagram content unavailable.',
      source: 'instagram',
      sourceUrl: url
    };
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
    
    return {
      title: data.data.title || url,
      content: data.data.content || '',
      source: 'url',
      sourceUrl: url
    };
  } catch (error) {
    console.error('Generic scrape error:', error);
    return {
      title: url,
      content: 'Failed to extract content from this URL.',
      source: 'url',
      sourceUrl: url
    };
  }
}
