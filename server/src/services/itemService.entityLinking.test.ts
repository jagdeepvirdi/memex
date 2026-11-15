import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client.js', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('./classifier.js', () => ({ classify: vi.fn() }))
vi.mock('../db/helpers.js', async orig => ({
  ...(await orig<typeof import('../db/helpers.js')>()),
  setItemTags: vi.fn().mockResolvedValue(undefined),
  setItemCategories: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./entityService.js', () => ({ extractAndLinkEntities: vi.fn().mockResolvedValue(undefined) }))

import { applyClassificationResult } from './itemService'
import { extractAndLinkEntities } from './entityService.js'

const RESULT = {
  type: 'link', title: 'claude-code', summary: 'A coding agent.', categories: ['Tech', 'AI', 'Repos'], tags: ['ai'],
  structured: { kind: 'repo', repoName: 'anthropics/claude-code' }, confidence: 88, intent: 'reference', model: 'ollama:llama3.2',
} as never

const client = () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }) as any

beforeEach(() => vi.clearAllMocks())

describe('applyClassificationResult — entity graph', () => {
  it('relinks entities from the applied structured data (summary included)', async () => {
    const c = client()
    await applyClassificationResult(c, 'item-1', RESULT, false)
    expect(extractAndLinkEntities).toHaveBeenCalledWith(c, 'item-1', 'link', {
      kind: 'repo', repoName: 'anthropics/claude-code', summary: 'A coding agent.',
    })
  })

  it('does not touch the graph for a reviewed item (the extraction is recorded, not applied)', async () => {
    await applyClassificationResult(client(), 'item-1', RESULT, true)
    expect(extractAndLinkEntities).not.toHaveBeenCalled()
  })
})
