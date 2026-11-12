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

  it('defaults to manual for plain text', () => {
    expect(detectPasteSource('buy milk')).toEqual({ source: 'manual' })
  })
})
