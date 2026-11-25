import { describe, it, expect } from 'vitest'
import { previewToCreateRequest, type IngestPreview } from './ingest'

const preview: IngestPreview = {
  title: 'anthropics/claude-code',
  type: 'link',
  content: 'https://github.com/anthropics/claude-code',
  structured: { kind: 'repo', repoName: 'anthropics/claude-code', summary: 'A CLI' },
  categories: ['Tech', 'AI', 'Repos'],
  tags: ['cli'],
  source: 'url',
  sourceUrl: 'https://github.com/anthropics/claude-code',
  confidence: 91,
  intent: 'reference',
  reviewed: false,
}

describe('previewToCreateRequest', () => {
  it('carries structured, intent, confidence and sourceUrl (previously dropped on save)', () => {
    const req = previewToCreateRequest(preview)
    expect(req.structured).toEqual(preview.structured)
    expect(req.intent).toBe('reference')
    expect(req.confidence).toBe(91)
    expect(req.sourceUrl).toBe('https://github.com/anthropics/claude-code')
    expect(req.source).toBe('url')
  })

  it('passes reviewed through so AI captures enter the review queue', () => {
    expect(previewToCreateRequest(preview).reviewed).toBe(false)
  })

  it('sends priority, defaulting to null (untriaged)', () => {
    expect(previewToCreateRequest(preview).priority).toBeNull()
    expect(previewToCreateRequest(preview, 'essential').priority).toBe('essential')
  })

  it('copies the classification fields', () => {
    const req = previewToCreateRequest(preview)
    expect(req).toMatchObject({
      title: preview.title, type: 'link', content: preview.content,
      categories: ['Tech', 'AI', 'Repos'], tags: ['cli'],
    })
  })

  describe('places found in a note', () => {
    const hotel = { name: 'Lakeview Hotel', type: 'hotel' as const, city: 'Pine Valley', evidence: '…Lakeview Hotel…', confidence: 88 }
    const diner = { name: 'Maple Diner', type: 'restaurant' as const, confidence: 90 }

    it('sends nothing about places unless the user kept some', () => {
      const req = previewToCreateRequest({ ...preview, places: [hotel], placesModel: 'gemini:x' })
      expect(req).not.toHaveProperty('places')
      expect(req).not.toHaveProperty('placesModel')
    })

    it('sends the kept places and the model that found them, without the display-only evidence', () => {
      const req = previewToCreateRequest({ ...preview, places: [hotel, diner], placesModel: 'gemini:x' }, null, [hotel, diner])
      expect(req.places).toEqual([
        { name: 'Lakeview Hotel', type: 'hotel', city: 'Pine Valley', confidence: 88 },
        { name: 'Maple Diner', type: 'restaurant', confidence: 90 },
      ])
      expect(req.placesModel).toBe('gemini:x')
    })
  })
})
