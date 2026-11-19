import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('./classifier', () => ({ classify: vi.fn() }))
vi.mock('./entityService', () => ({ extractAndLinkEntities: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./ingestJobs', () => ({
  updateJobProgress: vi.fn().mockResolvedValue(undefined),
  completeJob: vi.fn().mockResolvedValue(undefined),
  failJob: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../db/helpers', () => ({
  setItemCategories: vi.fn().mockResolvedValue(undefined),
  setItemTags: vi.fn().mockResolvedValue(undefined),
  createItem: vi.fn().mockResolvedValue({ id: 'split-1', type: 'link', structured: {} }),
}))

import { classifyAndUpdateBatch, type BatchEntry } from './enrichBatch'
import { pool } from '../db/client'
import { classify } from './classifier'
import { completeJob, failJob } from './ingestJobs'
import { createItem, setItemTags } from '../db/helpers'

const RESULT = {
  type: 'link', title: 'Claude Code', summary: 'A coding agent.', categories: ['Tech', 'AI', 'Repos'],
  tags: ['ai'], structured: { kind: 'repo' }, confidence: 88, intent: 'reference', model: 'ollama:llama3.2',
}

function mockClient(reviewed = false) {
  const client = {
    query: vi.fn().mockImplementation(async (sql: string) =>
      /SELECT reviewed/.test(sql) ? { rows: [{ reviewed }] } : { rows: [] }),
    release: vi.fn(),
  }
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  return client
}

const entry = (over: Partial<BatchEntry> = {}): BatchEntry => ({ content: 'some text', source: 'manual', ...over })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(classify).mockResolvedValue(RESULT as never)
})

describe('classifyAndUpdateBatch', () => {
  it('classifies, applies the result incl. intent, and completes the job once with details', async () => {
    const client = mockClient()
    await classifyAndUpdateBatch(['i1'], [entry({ labels: ['x'] })], 'job-1', { details: { entries: ['E'] } })

    const sqls = client.query.mock.calls.map(c => String(c[0]))
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls).toContain('COMMIT')

    const ext = client.query.mock.calls.find(c => /INSERT INTO item_extractions/.test(c[0]))!
    expect(ext[1].at(-1)).toBe('reference') // intent recorded in provenance
    expect(ext[1][9]).toBe(true) // applied (item not reviewed)

    const upd = client.query.mock.calls.find(c => /UPDATE items SET type/.test(c[0]))!
    expect(upd[0]).toMatch(/intent=COALESCE\(\$7, intent\)/)
    expect(upd[1][6]).toBe('reference')
    expect(setItemTags).toHaveBeenCalledWith(client, 'i1', ['ai', 'x']) // classifier tags + Keep labels

    expect(completeJob).toHaveBeenCalledTimes(1)
    expect(completeJob).toHaveBeenCalledWith('job-1', { entries: ['E'], classified: 1, failed: [] })
    expect(failJob).not.toHaveBeenCalled()
  })

  it('passes the source URL to the classifier as a hint, and only when there is one', async () => {
    mockClient()
    await classifyAndUpdateBatch(['i1', 'i2'], [entry({ sourceUrl: 'https://github.com/a/b' }), entry()], 'j')
    expect(vi.mocked(classify).mock.calls[0]).toEqual(['some text', { sourceUrl: 'https://github.com/a/b', cloudSafe: true }])
    expect(vi.mocked(classify).mock.calls[1]).toEqual(['some text', { cloudSafe: true }])
  })

  it('tells the classifier a note must stay local when its tags or its text say so', async () => {
    mockClient()
    await classifyAndUpdateBatch(
      ['i1', 'i2', 'i3'],
      [
        entry({ labels: ['Private'] }),
        entry({ labels: ['travel'] }),
        entry({ content: 'My bank account number is 0012 3456 7890 123' }),
      ],
      'j',
    )
    const hints = vi.mocked(classify).mock.calls.map(c => (c[1] as { cloudSafe?: boolean }).cloudSafe)
    expect(hints).toEqual([false, true, false])
  })

  it('records but does not apply the extraction for a reviewed item', async () => {
    const client = mockClient(true)
    await classifyAndUpdateBatch(['i1'], [entry()], 'j')
    const ext = client.query.mock.calls.find(c => /INSERT INTO item_extractions/.test(c[0]))!
    expect(ext[1][9]).toBe(false)
    expect(client.query.mock.calls.some(c => /UPDATE items SET type/.test(c[0]))).toBe(false)
  })

  it('splits a multi-entity entry; each split item keeps its own URL, else inherits the note URL, and carries intent', async () => {
    mockClient()
    vi.mocked(classify).mockResolvedValue({
      ...RESULT, multiEntity: true,
      entities: [{ title: 'Repo A', repoUrl: 'https://github.com/a/a' }, { title: 'Repo B' }],
    } as never)

    await classifyAndUpdateBatch(['i1'], [entry({ source: 'instagram', sourceUrl: 'https://www.instagram.com/p/XYZ/' })], 'j')

    const calls = vi.mocked(createItem).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][1]).toMatchObject({ title: 'Repo A', source: 'instagram', sourceUrl: 'https://github.com/a/a', intent: 'reference', reviewed: false })
    expect(calls[1][1]).toMatchObject({ title: 'Repo B', source: 'instagram', sourceUrl: 'https://www.instagram.com/p/XYZ/' })
  })

  it('keeps Keep-style splits working (source keep, no URL)', async () => {
    mockClient()
    vi.mocked(classify).mockResolvedValue({ ...RESULT, multiEntity: true, entities: [{ title: 'Movie' }] } as never)
    await classifyAndUpdateBatch(['i1'], [{ title: 'List', content: 'a\nb', source: 'keep' }], 'j')
    expect(vi.mocked(createItem).mock.calls[0][1]).toMatchObject({ source: 'keep', sourceUrl: undefined })
  })

  it('still completes the job when an empty entry finishes last', async () => {
    mockClient()
    await classifyAndUpdateBatch(['i1', 'i2'], [entry(), { content: '', source: 'manual' }], 'j')
    expect(completeJob).toHaveBeenCalledTimes(1)
    expect(vi.mocked(completeJob).mock.calls[0][1]).toMatchObject({ classified: 1, failed: [] })
  })

  it('reports per-item failures in the job details and rolls back a DB failure', async () => {
    vi.mocked(classify)
      .mockResolvedValueOnce(RESULT as never)
      .mockRejectedValueOnce(new Error('Ollama timeout'))
      .mockResolvedValueOnce(RESULT as never)
    const client = mockClient()
    client.query.mockImplementation(async (sql: string) => {
      if (/SELECT reviewed/.test(sql)) return { rows: [{ reviewed: false }] }
      if (/INSERT INTO item_extractions/.test(sql) && client.query.mock.calls.filter(c => /INSERT INTO item_extractions/.test(c[0])).length === 2) {
        throw new Error('constraint violated')
      }
      return { rows: [] }
    })

    await classifyAndUpdateBatch(['a', 'b', 'c'], [entry({ title: 'A' }), entry({ title: 'B' }), entry({ title: 'C' })], 'j')

    const details = vi.mocked(completeJob).mock.calls[0][1] as { classified: number; failed: Array<{ itemId: string; title: string; error: string }> }
    expect(details.classified).toBe(1)
    expect(details.failed.map(f => f.itemId).sort()).toEqual(['b', 'c'])
    expect(details.failed.find(f => f.itemId === 'b')).toMatchObject({ title: 'B', error: 'Ollama timeout' })
    expect(details.failed.find(f => f.itemId === 'c')!.error).toMatch(/constraint violated/)
    expect(client.query.mock.calls.map(c => c[0])).toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalledTimes(2)
  })

  it('fails the job (not "completed") when every item failed, e.g. Ollama is down', async () => {
    vi.mocked(classify).mockRejectedValue(new Error('connect ECONNREFUSED'))
    await classifyAndUpdateBatch(['a', 'b'], [entry(), entry()], 'job-9', { details: { entries: [] } })
    expect(completeJob).not.toHaveBeenCalled()
    expect(failJob).toHaveBeenCalledTimes(1)
    const [id, error, details] = vi.mocked(failJob).mock.calls[0] as [string, string, { failed: unknown[] }]
    expect(id).toBe('job-9')
    expect(error).toMatch(/Ollama/)
    expect(details.failed).toHaveLength(2)
  })

  it('does not count a batch of only empty entries as a failure', async () => {
    await classifyAndUpdateBatch(['a'], [{ content: ' ', source: 'manual' }], 'j')
    expect(failJob).not.toHaveBeenCalled()
    expect(completeJob).toHaveBeenCalledTimes(1)
  })
})
