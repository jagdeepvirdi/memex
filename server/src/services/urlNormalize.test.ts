import { describe, it, expect } from 'vitest'
import { normalizeSourceUrl, sameSourceUrl } from './urlNormalize'

describe('normalizeSourceUrl', () => {
  it('collapses every YouTube form to one canonical watch URL', () => {
    const id = 'dQw4w9WgXcQ'
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://m.youtube.com/watch?v=${id}&t=30s`,
      `https://www.youtube.com/shorts/${id}`,
      `https://music.youtube.com/watch?v=${id}&list=RDx`,
    ]) {
      expect(normalizeSourceUrl(url)).toEqual({ normalized: `https://www.youtube.com/watch?v=${id}`, searchKey: id })
    }
  })

  it('ignores scheme, www, fragment, trailing slash and tracking params', () => {
    const a = normalizeSourceUrl('http://www.Example.com/Post/?utm_source=x&fbclid=1&igsh=2#top')
    expect(a?.normalized).toBe('example.com/Post')
    expect(a?.searchKey).toBe('example.com/Post')
  })

  it('keeps meaningful query params, order-insensitively', () => {
    expect(normalizeSourceUrl('https://example.com/s?b=2&a=1')?.normalized).toBe('example.com/s?a=1&b=2')
    expect(sameSourceUrl('https://example.com/s?b=2&a=1', 'https://example.com/s?a=1&b=2')).toBe(true)
    expect(sameSourceUrl('https://example.com/s?a=1', 'https://example.com/s?a=2')).toBe(false)
  })

  it('treats GitHub paths case-insensitively and ignores .git', () => {
    expect(sameSourceUrl('https://github.com/Anthropics/Claude-Code', 'https://www.github.com/anthropics/claude-code.git')).toBe(true)
  })

  it('does not lowercase paths on other hosts', () => {
    expect(sameSourceUrl('https://example.com/Post', 'https://example.com/post')).toBe(false)
  })

  it('does not confuse a root URL with a deeper page', () => {
    expect(sameSourceUrl('https://example.com', 'https://example.com/')).toBe(true)
    expect(sameSourceUrl('https://example.com', 'https://example.com/about')).toBe(false)
  })

  it('returns null for non-http(s) and unparseable input', () => {
    expect(normalizeSourceUrl('ftp://example.com/x')).toBeNull()
    expect(normalizeSourceUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeSourceUrl('hello')).toBeNull()
    expect(sameSourceUrl('hello', 'hello')).toBe(false)
  })
})
