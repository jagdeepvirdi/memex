import { describe, it, expect } from 'vitest'
import { itemsToCsv } from './export'

const baseItem = (overrides = {}) => ({
  id: 'abc-123',
  title: 'Pad Thai',
  type: 'recipe',
  source: 'manual',
  createdAt: new Date('2024-01-15'),
  categories: ['Food', 'Savory', 'Thai'],
  tags: ['thai', 'noodles'],
  structured: {},
  ...overrides,
})

describe('itemsToCsv', () => {
  it('returns empty string for empty array', () => {
    expect(itemsToCsv([])).toBe('')
  })

  it('produces a header row + one data row', () => {
    const csv = itemsToCsv([baseItem()])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('id')
    expect(lines[0]).toContain('title')
    expect(lines[0]).toContain('type')
  })

  it('wraps all values in double quotes', () => {
    // Use single-tag, single-category item so no quoted value contains a comma
    const csv = itemsToCsv([baseItem({ tags: ['thai'], categories: ['Food'] })])
    const dataRow = csv.split('\n')[1]
    dataRow.split(',').forEach(field => {
      expect(field).toMatch(/^".*"$/)
    })
  })

  it('joins categories with " > "', () => {
    const csv = itemsToCsv([baseItem()])
    expect(csv).toContain('"Food > Savory > Thai"')
  })

  it('joins tags with ", "', () => {
    const csv = itemsToCsv([baseItem()])
    expect(csv).toContain('"thai, noodles"')
  })

  it('flattens structured fields with s_ prefix', () => {
    const csv = itemsToCsv([
      baseItem({ structured: { cuisine: 'Thai', servings: '2' } }),
    ])
    expect(csv).toContain('s_cuisine')
    expect(csv).toContain('s_servings')
    expect(csv).toContain('"Thai"')
    expect(csv).toContain('"2"')
  })

  it('escapes double-quote characters inside values', () => {
    const csv = itemsToCsv([baseItem({ title: 'He said "hello"' })])
    expect(csv).toContain('"He said ""hello"""')
  })

  it('serializes array structured values as JSON', () => {
    const ingredients = ['noodles', 'egg', 'tofu']
    const csv = itemsToCsv([baseItem({ structured: { ingredients } })])
    expect(csv).toContain(JSON.stringify(ingredients).replace(/"/g, '""'))
  })

  it('emits empty string for null/undefined structured values', () => {
    const csv = itemsToCsv([
      baseItem({ structured: { rating: null } }),
    ])
    // null → '""'
    const lines = csv.split('\n')
    const dataRow = lines[1]
    expect(dataRow).toContain('""')
  })

  it('header includes all structured keys from all items', () => {
    const items = [
      baseItem({ structured: { cuisine: 'Thai' } }),
      baseItem({ id: 'xyz', structured: { servings: '4' } }),
    ]
    const csv = itemsToCsv(items)
    const headers = csv.split('\n')[0]
    // 7 base headers + s_cuisine + s_servings = 9 total
    expect(headers.split(',').length).toBe(9)
    expect(headers).toContain('s_cuisine')
    expect(headers).toContain('s_servings')
  })
})
