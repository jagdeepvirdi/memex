import { describe, it, expect } from 'vitest'
import { detectPasteSource } from './sourceDetect'

describe('detectPasteSource', () => {
  it('tags an Instagram caption that contains a post URL', () => {
    expect(detectPasteSource('Best repos this week! https://www.instagram.com/p/Cabc123XYZ/?igsh=1 #ai')).toEqual({
      source: 'instagram',
      sourceUrl: 'https://www.instagram.com/p/Cabc123XYZ/?igsh=1',
    })
  })

  it('handles reels and trailing punctuation', () => {
    expect(detectPasteSource('watch https://instagram.com/reel/Xyz_9-a.')).toEqual({
      source: 'instagram',
      sourceUrl: 'https://instagram.com/reel/Xyz_9-a',
    })
  })

  it('ignores Instagram profile pages (not a post)', () => {
    expect(detectPasteSource('follow https://instagram.com/someone')).toEqual({ source: 'manual' })
  })

  it('tags a pasted GitHub repo link with its canonical URL', () => {
    expect(detectPasteSource('https://github.com/anthropics/claude-code/tree/main')).toEqual({
      source: 'url',
      sourceUrl: 'https://github.com/anthropics/claude-code',
    })
  })

  it('does not treat a passing mention or a multi-repo list as the subject', () => {
    expect(detectPasteSource('try github.com/a/b sometime')).toEqual({ source: 'manual' })
    expect(detectPasteSource('https://github.com/a/b\nhttps://github.com/c/d')).toEqual({ source: 'manual' })
  })

  it('tags pasted text containing a single YouTube video, in any URL form', () => {
    expect(detectPasteSource('Gordon Ramsay pasta https://youtu.be/dQw4w9WgXcQ?si=abc')).toEqual({
      source: 'youtube',
      sourceUrl: 'https://youtu.be/dQw4w9WgXcQ?si=abc',
    })
    expect(detectPasteSource('https://www.youtube.com/shorts/dQw4w9WgXcQ').source).toBe('youtube')
    expect(detectPasteSource('<p>see <a href="https://m.youtube.com/watch?v=dQw4w9WgXcQ">this</a>.</p>')).toEqual({
      source: 'youtube',
      sourceUrl: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    })
  })

  it('counts the same video linked twice (watch + youtu.be) as one video', () => {
    expect(detectPasteSource('https://youtu.be/dQw4w9WgXcQ and https://www.youtube.com/watch?v=dQw4w9WgXcQ').source).toBe('youtube')
  })

  it('leaves a note with several different videos as manual (to be split, not mislabelled)', () => {
    expect(detectPasteSource('https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/9bZkp7q19f0')).toEqual({ source: 'manual' })
  })

  it('ignores YouTube playlist/channel links', () => {
    expect(detectPasteSource('https://www.youtube.com/playlist?list=PL1234567890A')).toEqual({ source: 'manual' })
  })

  it('still prefers Instagram and GitHub over a YouTube link', () => {
    expect(detectPasteSource('https://instagram.com/p/Cabc123XYZ/ https://youtu.be/dQw4w9WgXcQ').source).toBe('instagram')
    expect(detectPasteSource('https://github.com/a/b').source).toBe('url')
  })

  it('defaults to manual for plain text', () => {
    expect(detectPasteSource('buy milk')).toEqual({ source: 'manual' })
  })
})
