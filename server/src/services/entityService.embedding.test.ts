import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./embedder', () => ({ embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) }))

import { embedQuery } from './embedder'
import { getOrCreateEntity } from './entityService'
import { setActiveEmbedding, buildEmbedding } from './embeddingConfig'

function insertParams(client: { query: ReturnType<typeof vi.fn> }): unknown[] {
  return client.query.mock.calls[1][1] as unknown[]
}
function newClient() {
  const client = { query: vi.fn() }
  client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'e1' }] })
  return client
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => setActiveEmbedding(null))

describe('getOrCreateEntity — embeddings by active model', () => {
  it('embeds the name with the local model and records which model made the vector', async () => {
    const client = newClient()
    await getOrCreateEntity(client as never, 'Some Director', 'person')
    expect(embedQuery).toHaveBeenCalledWith('Some Director')
    expect(insertParams(client)).toEqual(['Some Director', 'person', JSON.stringify([0.1, 0.2, 0.3]), 'ollama:nomic-embed-text'])
  })

  it('never sends an entity name to a cloud embedding model (it cannot tell whether its item was private)', async () => {
    setActiveEmbedding(buildEmbedding('gemini'))
    const client = newClient()
    await getOrCreateEntity(client as never, 'Some Director', 'person')
    expect(embedQuery).not.toHaveBeenCalled()
    expect(insertParams(client)).toEqual(['Some Director', 'person', null, null])
  })

  it('still creates the entity under a cloud model, just without a vector', async () => {
    setActiveEmbedding(buildEmbedding('openai'))
    const client = newClient()
    const ent = await getOrCreateEntity(client as never, 'Some City', 'place' as never)
    expect(ent.id).toBe('e1')
  })
})
