import { describe, it, expect } from 'vitest'
import { DEMO_ITEMS, DEMO_TAGS } from './demoData'
import { cloudSafe } from './cloudSafe'

const TYPES = ['note', 'recipe', 'media', 'book', 'place', 'spec', 'stock', 'link']
const ROOTS = ['Food', 'Media', 'Tech', 'Finance', 'Links', 'Travel']

describe('sample data set', () => {
  it('has about forty items', () => {
    expect(DEMO_ITEMS.length).toBeGreaterThanOrEqual(35)
    expect(DEMO_ITEMS.length).toBeLessThanOrEqual(45)
  })

  it('covers every item type', () => {
    expect(new Set(DEMO_ITEMS.map(i => i.type))).toEqual(new Set(TYPES))
  })

  it('has no duplicate titles within a type', () => {
    const keys = DEMO_ITEMS.map(i => `${i.type}:${i.title}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('files every item under a real top-level category, and never under Passwords or Personal', () => {
    for (const i of DEMO_ITEMS) expect(ROOTS).toContain(i.categories[0])
  })

  it('gives every item content, tags and a category', () => {
    for (const i of DEMO_ITEMS) {
      expect(i.content.length).toBeGreaterThan(20)
      expect(i.tags.length).toBeGreaterThan(0)
      expect(i.categories.length).toBeGreaterThan(0)
    }
  })

  it('keeps tags lower-case (the writer lower-cases them, so clear must match)', () => {
    for (const t of DEMO_TAGS) expect(t).toBe(t.toLowerCase().trim())
  })

  it('uses only example.com for web addresses', () => {
    const urls = DEMO_ITEMS.flatMap(i => [i.sourceUrl, ...(i.content.match(/https?:\/\/\S+/g) ?? [])]).filter(Boolean) as string[]
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect(new URL(u).hostname).toBe('example.com')
  })

  it('contains nothing that looks like contact or account details', () => {
    const all = JSON.stringify(DEMO_ITEMS)
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
    expect(all).not.toMatch(/\+?\d[\d ()-]{9,}\d/)
  })

  it('passes the same privacy guard a real item does, so it can go to a cloud AI like any ordinary note', () => {
    for (const i of DEMO_ITEMS) {
      expect(cloudSafe({ type: i.type, categories: i.categories, tags: i.tags, title: i.title, content: i.content })).toBe(true)
    }
  })

  it('declares a name and role for every linked entity', () => {
    for (const e of DEMO_ITEMS.flatMap(i => i.entities ?? [])) {
      expect(e.name.trim()).not.toBe('')
      expect(e.role.trim()).not.toBe('')
    }
  })

  it('has valid structured data per type', () => {
    for (const i of DEMO_ITEMS) {
      if (i.type === 'recipe') {
        expect((i.structured.ingredients as string[]).length).toBeGreaterThan(0)
        expect((i.structured.steps as string[]).length).toBeGreaterThan(0)
      }
      if (i.type === 'stock') expect(typeof i.structured.ticker).toBe('string')
      if (i.type === 'place') expect(['visited', 'want-to-visit', 'want-to-revisit']).toContain(i.structured.visitStatus)
      if (i.type === 'book') expect(['want-to-read', 'reading', 'read']).toContain(i.structured.status)
      if (i.type === 'media') expect(['watched', 'want-to-watch', 'watching']).toContain(i.structured.watchStatus)
      expect(i.structured).not.toHaveProperty('demo')
    }
  })
})
