import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/client', () => ({ pool: { query: vi.fn() } }))
const mockBlocked = vi.fn()
vi.mock('./embeddingStatus', () => ({
  embeddingBlockedReason: (...a: unknown[]) => mockBlocked(...a),
  REEMBED_JOB_KIND: 'reembed',
  REEMBED_STALE_HOURS: 6,
}))
const mockHasRunning = vi.fn()
vi.mock('./ingestJobs', () => ({ hasRunningJob: (...a: unknown[]) => mockHasRunning(...a) }))
const mockSnapshot = vi.fn()
vi.mock('./embeddingCalibration', () => ({ snapshotReference: (...a: unknown[]) => mockSnapshot(...a) }))
const mockLoad = vi.fn()
vi.mock('./embeddingConfig', async (orig) => ({
  ...(await orig<typeof import('./embeddingConfig')>()),
  loadEmbeddingConfig: () => mockLoad(),
}))

import { pool } from '../db/client'
import { buildEmbedding, setActiveEmbedding } from './embeddingConfig'
import { estimateReembed, switchEmbeddingModel, reembedRunning, EmbeddingSwitchError } from './embeddingSwitch'

const GEMINI = buildEmbedding('gemini')
const LOCAL = buildEmbedding('ollama')
const rows = (...r: unknown[]) => ({ rows: r }) as never
const cand = (over: Record<string, unknown> = {}) => ({ type: 'note', chars: 400, categories: ['Food'], tags: ['dinner'], ...over })

/** estimateReembed runs: candidates, already-done, skipped (cloud only), entities (local only). */
function queueEstimate(opts: { candidates: unknown[]; done?: string; skipped?: string; entities?: string; cloud: boolean }) {
  const q = vi.mocked(pool.query)
  q.mockResolvedValueOnce(rows(...opts.candidates))
  q.mockResolvedValueOnce(rows({ n: opts.done ?? '0' }))
  if (opts.cloud) q.mockResolvedValueOnce(rows({ n: opts.skipped ?? '0' }))
  else q.mockResolvedValueOnce(rows({ n: opts.entities ?? '0' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBlocked.mockResolvedValue(null)
  mockHasRunning.mockResolvedValue(false)
  mockLoad.mockResolvedValue(GEMINI)
  mockSnapshot.mockResolvedValue('saved')
  vi.mocked(pool.query).mockResolvedValue(rows())
})

describe('estimateReembed — cloud model', () => {
  it('counts what would be sent, with an approximate token figure, and what stays home', async () => {
    queueEstimate({
      cloud: true, done: '5', skipped: '2',
      candidates: [
        cand({ chars: 400 }),
        cand({ chars: 600, type: 'recipe' }),
        cand({ chars: 999, tags: ['private'] }),       // stays home
        cand({ chars: 999, categories: ['Passwords'] }), // stays home
      ],
    })
    const e = await estimateReembed(GEMINI)
    expect(e).toMatchObject({
      cloud: true, items: 2, characters: 1000, approxTokens: 250, skippedPrivate: 4, alreadyDone: 5, entities: 0, blockedReason: null,
      target: { provider: 'gemini', model: 'gemini-embedding-001', id: 'gemini:gemini-embedding-001' },
    })
  })

  it('never counts private characters as text to be sent', async () => {
    queueEstimate({ cloud: true, candidates: [cand({ chars: 5000, tags: ['local-only'] })] })
    const e = await estimateReembed(GEMINI)
    expect(e.items).toBe(0)
    expect(e.characters).toBe(0)
    expect(e.skippedPrivate).toBe(1)
  })

  it('excludes already-skipped items from the candidates for a cloud target', async () => {
    queueEstimate({ cloud: true, candidates: [] })
    await estimateReembed(GEMINI)
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(String(sql)).toMatch(/i\.embedding_skip IS NULL OR \$2::boolean = false/)
    expect(params).toEqual(['gemini:gemini-embedding-001', true])
  })

  it('reports why the target is unusable instead of hiding the numbers', async () => {
    mockBlocked.mockResolvedValue('Cloud AI is not enabled in Settings')
    queueEstimate({ cloud: true, candidates: [cand()] })
    expect((await estimateReembed(GEMINI)).blockedReason).toBe('Cloud AI is not enabled in Settings')
  })

  it('sends nothing: it only reads the database', async () => {
    queueEstimate({ cloud: true, candidates: [cand()] })
    await estimateReembed(GEMINI)
    for (const [sql] of vi.mocked(pool.query).mock.calls) expect(String(sql)).toMatch(/^\s*SELECT/i)
  })
})

describe('estimateReembed — the same privacy rule as the writer', () => {
  it('counts an item whose text looks sensitive as staying home, not as sent', async () => {
    queueEstimate({
      cloud: true,
      candidates: [
        cand({ chars: 400, text: 'Pasta night\n\nBoil, toss, serve.' }),
        cand({ chars: 500, text: 'Rent\n\nAccount number 1234 5678 9012' }),
        cand({ chars: 300, text: 'Shop\n\nhttps://shop.example.com/p/1234567890123456' }), // a link id is not a secret
      ],
    })
    const e = await estimateReembed(GEMINI)
    expect(e.items).toBe(2)
    expect(e.characters).toBe(700)
    expect(e.skippedPrivate).toBe(1)
  })

  it('reads the text an embedding would send, from the database', async () => {
    queueEstimate({ cloud: true, candidates: [] })
    await estimateReembed(GEMINI)
    expect(String(vi.mocked(pool.query).mock.calls[0][0])).toMatch(/LEFT\(i\.title \|\| chr\(10\) \|\| chr\(10\) \|\| i\.content, 6000\) AS text/)
  })
})

describe('estimateReembed — local model', () => {
  it('embeds everything, including items that were private under a cloud model, and counts entity names', async () => {
    queueEstimate({ cloud: false, entities: '12', candidates: [cand({ chars: 100 }), cand({ chars: 100, tags: ['private'] })] })
    const e = await estimateReembed(LOCAL)
    expect(e).toMatchObject({ cloud: false, items: 2, characters: 200, skippedPrivate: 0, entities: 12 })
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(['ollama:nomic-embed-text', false])
  })
})

describe('switchEmbeddingModel', () => {
  it('stores the provider and model, reloads the cache and returns the new active model', async () => {
    const active = await switchEmbeddingModel('gemini', 'gemini-embedding-2')
    expect(active).toBe(GEMINI)
    const [sql, params] = vi.mocked(pool.query).mock.calls[0]
    expect(String(sql)).toMatch(/INSERT INTO settings.*embedding_provider.*embedding_model/s)
    expect(params).toEqual([JSON.stringify('gemini'), JSON.stringify('gemini-embedding-2')])
    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  it('uses the default model when none is given', async () => {
    await switchEmbeddingModel('openai')
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual([JSON.stringify('openai'), JSON.stringify('text-embedding-3-small')])
  })

  it('refuses a cloud model that cannot be used yet, and changes nothing', async () => {
    mockBlocked.mockResolvedValue('No API key is configured for gemini')
    await expect(switchEmbeddingModel('gemini')).rejects.toMatchObject({ status: 409, message: 'No API key is configured for gemini' })
    expect(pool.query).not.toHaveBeenCalled()
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('refuses to switch while a re-embed is running', async () => {
    mockHasRunning.mockResolvedValue(true)
    const err = await switchEmbeddingModel('gemini').catch(e => e)
    expect(err).toBeInstanceOf(EmbeddingSwitchError)
    expect(err.message).toMatch(/re-embed is running/)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('makes private-skipped items candidates again when going back to the local model', async () => {
    await switchEmbeddingModel('ollama')
    const sqls = vi.mocked(pool.query).mock.calls.map(c => String(c[0]))
    expect(sqls.some(s => /UPDATE items SET embedding_skip = NULL WHERE embedding_skip IS NOT NULL/.test(s))).toBe(true)
  })

  it('leaves skip markers alone when switching to a cloud model', async () => {
    await switchEmbeddingModel('gemini')
    const sqls = vi.mocked(pool.query).mock.calls.map(c => String(c[0]))
    expect(sqls.some(s => /UPDATE items/.test(s))).toBe(false)
  })
})

describe('switchEmbeddingModel — calibration reference', () => {
  afterEach(() => setActiveEmbedding(null))

  it('saves the reference share of the model it is leaving, before changing anything', async () => {
    await switchEmbeddingModel('gemini')
    expect(mockSnapshot).toHaveBeenCalledWith('ollama:nomic-embed-text')
    // the snapshot happens before the settings are written
    expect(mockSnapshot.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(pool.query).mock.invocationCallOrder[0])
  })

  it('does not snapshot when switching to the model that is already active', async () => {
    await switchEmbeddingModel('ollama')
    expect(mockSnapshot).not.toHaveBeenCalled()
  })

  it('does not snapshot when the switch is refused', async () => {
    mockBlocked.mockResolvedValue('Cloud AI is not enabled in Settings')
    await expect(switchEmbeddingModel('gemini')).rejects.toBeInstanceOf(EmbeddingSwitchError)
    expect(mockSnapshot).not.toHaveBeenCalled()
  })

  it('still switches when the snapshot reports it could not save', async () => {
    mockSnapshot.mockResolvedValue('skipped')
    expect(await switchEmbeddingModel('gemini')).toBe(GEMINI)
    expect(mockLoad).toHaveBeenCalled()
  })
})

describe('reembedRunning', () => {
  it('asks for a running job of the re-embed kind with the long stale window', async () => {
    mockHasRunning.mockResolvedValue(true)
    expect(await reembedRunning()).toBe(true)
    expect(mockHasRunning).toHaveBeenCalledWith('reembed', 360)
  })
})
