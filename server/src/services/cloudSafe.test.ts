import { describe, it, expect } from 'vitest'
import { cloudSafe, allCloudSafe } from './cloudSafe.js'

describe('cloudSafe', () => {
  it('allows ordinary items', () => {
    expect(cloudSafe({ type: 'note', categories: ['Food', 'Bakery', 'Cakes'], tags: ['recipe'] })).toBe(true)
    expect(cloudSafe({})).toBe(true)
  })

  it('blocks encrypted and password items', () => {
    expect(cloudSafe({ encrypted: true })).toBe(false)
    expect(cloudSafe({ type: 'password' })).toBe(false)
  })

  it('blocks Passwords and Personal categories, case-insensitively', () => {
    expect(cloudSafe({ categories: ['Passwords'] })).toBe(false)
    expect(cloudSafe({ categories: ['personal', 'Contacts'] })).toBe(false)
    expect(cloudSafe({ categories: [' Personal '] })).toBe(false)
  })

  it('only looks at the top-level category', () => {
    expect(cloudSafe({ categories: ['Tech', 'Personal'] })).toBe(true)
  })

  it('blocks items tagged as private', () => {
    expect(cloudSafe({ tags: ['x', 'No-Cloud'] })).toBe(false)
    expect(cloudSafe({ tags: ['local-only'] })).toBe(false)
  })

  it('allCloudSafe fails if any item is unsafe', () => {
    expect(allCloudSafe([{ type: 'note' }, { type: 'link' }])).toBe(true)
    expect(allCloudSafe([{ type: 'note' }, { type: 'password' }])).toBe(false)
    expect(allCloudSafe([])).toBe(true)
  })
})
