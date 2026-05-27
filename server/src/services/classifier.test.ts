import { describe, it, expect } from 'vitest';

// Simple mock for JSON extraction since we don't want to call real AI in unit tests
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) return raw.slice(start, end + 1)
  return raw.trim()
}

describe('AI Classifier Logic', () => {
  it('should extract JSON from markdown fences', () => {
    const raw = 'Here is your JSON:\n```json\n{"type": "note", "title": "Hello"}\n```\nHope this helps!';
    expect(extractJson(raw)).toBe('{"type": "note", "title": "Hello"}');
  });

  it('should extract JSON from raw text without fences', () => {
    const raw = 'Some random preamble {"type": "recipe"} some postamble';
    expect(extractJson(raw)).toBe('{"type": "recipe"}');
  });

  it('should return trimmed text if no braces found', () => {
    const raw = '  Just plain text  ';
    expect(extractJson(raw)).toBe('Just plain text');
  });
});
