import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('youtube-transcript', () => ({ YoutubeTranscript: { fetchTranscript: vi.fn() } }));
vi.mock('./settings.js', () => ({
  getSetting: vi.fn().mockResolvedValue(false),
  asBool: (v: unknown) => v === true || v === 'true',
}));
vi.mock('../lib/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { YoutubeTranscript } from 'youtube-transcript';
import { extractYoutubeId, extractInstagramShortcode, findYoutubeUrl, scrapeUrl, MAX_TRANSCRIPT_CHARS } from './scraper';

const ID = 'dQw4w9WgXcQ';

describe('YouTube URL recognition', () => {
  it.each([
    ['Shorts', `https://www.youtube.com/shorts/${ID}`],
    ['mobile host', `https://m.youtube.com/watch?v=${ID}`],
    ['music host', `https://music.youtube.com/watch?v=${ID}`],
    ['live', `https://www.youtube.com/live/${ID}`],
    ['si= tracking param', `https://youtu.be/${ID}?si=abcDEF123`],
    ['v= after other params', `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`],
    ['playlist context with v=', `https://www.youtube.com/watch?v=${ID}&list=PL12345`],
    ['no scheme padding/whitespace', `  https://youtube.com/watch?v=${ID}  `],
  ])('extracts the id from %s', (_name, url) => {
    expect(extractYoutubeId(url)).toBe(ID);
  });

  it.each([
    ['playlist only', 'https://www.youtube.com/playlist?list=PL1234567890A'],
    ['channel', 'https://www.youtube.com/@somechannel'],
    ['lookalike host', `https://notyoutube.com/watch?v=${ID}`],
    ['short id', 'https://www.youtube.com/watch?v=abc'],
    ['not a url', 'hello world'],
  ])('returns null for %s', (_name, url) => {
    expect(extractYoutubeId(url)).toBeNull();
  });

  it('finds a YouTube url inside pasted text and strips trailing punctuation', () => {
    const found = findYoutubeUrl(`Try this one: https://youtu.be/${ID}?si=x, it is great. Also https://example.com`);
    expect(found).toEqual({ url: `https://youtu.be/${ID}?si=x`, videoId: ID });
  });

  it('returns null when the text has no YouTube url', () => {
    expect(findYoutubeUrl('see https://example.com/a and notes')).toBeNull();
  });
});

describe('scrapeUrl — YouTube', () => {
  const fetchMock = vi.fn();
  const transcript = vi.mocked(YoutubeTranscript.fetchTranscript);

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    transcript.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const oembedOk = () => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ title: 'Great Pasta', author_name: 'Chef Joe' }) });

  it('returns title, channel and transcript', async () => {
    oembedOk();
    transcript.mockResolvedValue([{ text: 'boil water', duration: 1, offset: 0 }, { text: 'add salt', duration: 1, offset: 1 }]);
    const r = await scrapeUrl(`https://www.youtube.com/shorts/${ID}`);
    expect(r).toMatchObject({
      source: 'youtube', title: 'Great Pasta', channel: 'Chef Joe', videoId: ID,
      transcript: 'boil water add salt', transcriptAvailable: true, transcriptTruncated: false, failure: undefined,
    });
    expect(r.content).toBe('boil water add salt');
  });

  it('caps very long transcripts and flags truncation', async () => {
    oembedOk();
    transcript.mockResolvedValue([{ text: 'x'.repeat(MAX_TRANSCRIPT_CHARS + 500), duration: 1, offset: 0 }]);
    const r = await scrapeUrl(`https://youtu.be/${ID}`);
    expect(r.transcript).toHaveLength(MAX_TRANSCRIPT_CHARS);
    expect(r.transcriptTruncated).toBe(true);
  });

  it('keeps title and channel when the transcript fails, and reports why', async () => {
    oembedOk();
    transcript.mockRejectedValue(new Error('Transcript is disabled'));
    const r = await scrapeUrl(`https://youtu.be/${ID}`);
    expect(r).toMatchObject({ title: 'Great Pasta', channel: 'Chef Joe', transcriptAvailable: false, failure: 'Transcript is disabled' });
    expect(r.content).toContain('Great Pasta');
    expect(r.content).toContain('Channel: Chef Joe');
  });

  it('treats an empty transcript as unavailable', async () => {
    oembedOk();
    transcript.mockResolvedValue([]);
    const r = await scrapeUrl(`https://youtu.be/${ID}`);
    expect(r.transcriptAvailable).toBe(false);
    expect(r.failure).toMatch(/empty/i);
  });

  it('keeps the transcript when oEmbed fails (private/removed metadata)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    transcript.mockResolvedValue([{ text: 'hello', duration: 1, offset: 0 }]);
    const r = await scrapeUrl(`https://youtu.be/${ID}`);
    expect(r.title).toBe(`YouTube Video (${ID})`);
    expect(r.channel).toBeUndefined();
    expect(r.transcriptAvailable).toBe(true);
  });

  it('fails soft when everything fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    transcript.mockRejectedValue(new Error('no captions'));
    const r = await scrapeUrl(`https://youtu.be/${ID}`);
    expect(r).toMatchObject({ source: 'youtube', transcriptAvailable: false, failure: 'no captions' });
  });
});

describe('URL Scraper Detection', () => {
  describe('YouTube', () => {
    it('should extract ID from standard watch URL', () => {
      expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract ID from short youtu.be URL', () => {
      expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract ID from embed URL', () => {
      expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should return null for non-youtube URLs', () => {
      expect(extractYoutubeId('https://google.com')).toBeNull();
    });
  });

  describe('Instagram', () => {
    it('should extract shortcode from post URL', () => {
      expect(extractInstagramShortcode('https://www.instagram.com/p/C_abc123/')).toBe('C_abc123');
    });

    it('should extract shortcode from reels URL', () => {
      expect(extractInstagramShortcode('https://www.instagram.com/reels/C_abc123/')).toBe('C_abc123');
    });

    it('should return null for non-instagram URLs', () => {
      expect(extractInstagramShortcode('https://facebook.com')).toBeNull();
    });
  });
});
