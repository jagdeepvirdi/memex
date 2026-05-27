import { describe, it, expect } from 'vitest';
import { extractYoutubeId, extractInstagramShortcode } from './scraper';

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
