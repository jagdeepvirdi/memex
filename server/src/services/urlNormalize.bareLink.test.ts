import { describe, it, expect } from 'vitest'
import { extractUrls, isBareLinkTo, BARE_LINK_MAX_PROSE } from './urlNormalize'

describe('extractUrls', () => {
  it('finds links in free text and strips trailing sentence punctuation', () => {
    expect(extractUrls('see https://example.com/a, and (https://example.com/b). Also https://example.com/c!'))
      .toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/c'])
  })

  it('stops at HTML tags and quotes (the Manual editor saves HTML)', () => {
    expect(extractUrls('<p>https://youtu.be/dQw4w9WgXcQ</p><a href="https://example.com/x">x</a>'))
      .toEqual(['https://youtu.be/dQw4w9WgXcQ', 'https://example.com/x'])
  })

  it('keeps query strings and returns [] when there is no link', () => {
    expect(extractUrls('https://youtube.com/watch?v=abc&t=10s')).toEqual(['https://youtube.com/watch?v=abc&t=10s'])
    expect(extractUrls('just words, no link')).toEqual([])
    expect(extractUrls('')).toEqual([])
  })
})

describe('isBareLinkTo', () => {
  const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

  it('matches a note that is only the link, however it is spelled', () => {
    expect(isBareLinkTo('https://youtu.be/dQw4w9WgXcQ', VIDEO)).toBe(true)
    expect(isBareLinkTo('  https://m.youtube.com/watch?v=dQw4w9WgXcQ&si=abc\n', VIDEO)).toBe(true)
    expect(isBareLinkTo('https://www.youtube.com/shorts/dQw4w9WgXcQ', VIDEO)).toBe(true)
    expect(isBareLinkTo('<p>https://youtu.be/dQw4w9WgXcQ</p>', VIDEO)).toBe(true)
  })

  it('matches the link with a short caption around it', () => {
    expect(isBareLinkTo('great pasta video https://youtu.be/dQw4w9WgXcQ', VIDEO)).toBe(true)
    expect(isBareLinkTo(`${'w'.repeat(BARE_LINK_MAX_PROSE)} https://youtu.be/dQw4w9WgXcQ`, VIDEO)).toBe(true)
  })

  it('does not match a long note that merely mentions the link', () => {
    expect(isBareLinkTo(`${'word '.repeat(80)} https://youtu.be/dQw4w9WgXcQ`, VIDEO)).toBe(false)
  })

  it('does not match a list of several different links (it is a list, not that item)', () => {
    expect(isBareLinkTo('https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/aaaaaaaaaaa', VIDEO)).toBe(false)
  })

  it('matches the same link repeated, but not a different page', () => {
    expect(isBareLinkTo('https://youtu.be/dQw4w9WgXcQ https://www.youtube.com/watch?v=dQw4w9WgXcQ', VIDEO)).toBe(true)
    expect(isBareLinkTo('https://youtu.be/aaaaaaaaaaa', VIDEO)).toBe(false)
  })

  it('works for ordinary pages and ignores tracking params, www and trailing slashes', () => {
    expect(isBareLinkTo('https://www.example.com/post/?utm_source=x', 'https://example.com/post')).toBe(true)
    expect(isBareLinkTo('https://example.com/post-2', 'https://example.com/post')).toBe(false)
    expect(isBareLinkTo('https://github.com/Foo/Bar.git', 'https://github.com/foo/bar')).toBe(true)
  })

  it('does not match a root URL against a deeper page, or vice versa', () => {
    expect(isBareLinkTo('https://example.com/', 'https://example.com/deep/page')).toBe(false)
    expect(isBareLinkTo('https://example.com/deep/page', 'https://example.com/')).toBe(false)
  })

  it('is false for text with no link, empty text or an unparseable target', () => {
    expect(isBareLinkTo('no link here', VIDEO)).toBe(false)
    expect(isBareLinkTo('', VIDEO)).toBe(false)
    expect(isBareLinkTo('https://youtu.be/dQw4w9WgXcQ', 'not a url')).toBe(false)
  })

  it('honours a custom prose limit', () => {
    expect(isBareLinkTo('a fairly short caption https://youtu.be/dQw4w9WgXcQ', VIDEO, 5)).toBe(false)
    expect(isBareLinkTo('a fairly short caption https://youtu.be/dQw4w9WgXcQ', VIDEO, 50)).toBe(true)
  })
})
