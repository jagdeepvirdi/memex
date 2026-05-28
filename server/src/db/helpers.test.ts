import { describe, it, expect, vi } from 'vitest'
import { resolveCategoryPath } from './helpers'
import type { PoolClient } from 'pg'

function makeMockClient(returnIds: string[]): PoolClient {
  let call = 0
  return {
    query: vi.fn().mockImplementation(() =>
      Promise.resolve({ rows: [{ id: returnIds[call++] }] })
    ),
  } as unknown as PoolClient
}

describe('resolveCategoryPath', () => {
  it('walks a 3-level path and returns IDs in order', async () => {
    const client = makeMockClient(['id-food', 'id-savory', 'id-indian'])
    const result = await resolveCategoryPath(client, ['Food', 'Savory', 'Indian'])
    expect(result).toEqual(['id-food', 'id-savory', 'id-indian'])
    expect((client.query as any)).toHaveBeenCalledTimes(3)
  })

  it('uses only [name] params for a root category (no parent_id)', async () => {
    const client = makeMockClient(['id-root'])
    await resolveCategoryPath(client, ['Food'])
    // Root query: INSERT ... VALUES ($1, NULL) — single param
    expect((client.query as any).mock.calls[0][1]).toEqual(['Food'])
  })

  it('uses [name, parentId] params for child categories', async () => {
    const client = makeMockClient(['id-food', 'id-savory'])
    await resolveCategoryPath(client, ['Food', 'Savory'])
    // First call is root — just [name]
    expect((client.query as any).mock.calls[0][1]).toEqual(['Food'])
    // Second call is child — [name, parentId]
    expect((client.query as any).mock.calls[1][1]).toEqual(['Savory', 'id-food'])
  })

  it('chains parent IDs correctly across all levels', async () => {
    const client = makeMockClient(['id-1', 'id-2', 'id-3'])
    await resolveCategoryPath(client, ['A', 'B', 'C'])
    expect((client.query as any).mock.calls[1][1]).toEqual(['B', 'id-1'])
    expect((client.query as any).mock.calls[2][1]).toEqual(['C', 'id-2'])
  })

  it('returns an empty array for an empty path', async () => {
    const client = makeMockClient([])
    const result = await resolveCategoryPath(client, [])
    expect(result).toEqual([])
    expect((client.query as any)).not.toHaveBeenCalled()
  })
})
