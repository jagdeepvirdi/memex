import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('./itemSource', async orig => ({ ...(await orig<typeof import('./itemSource')>()), loadSourceText: vi.fn() }))

import { explainItem, parseExplanation, ExplainParseError } from './explainService'
import { aiChat } from './ai'
import { loadSourceText } from './itemSource'

const GOOD = JSON.stringify({
  summary: 'It explains X.',
  keyPoints: ['a', 'b', 7, ''],
  steps: ['one', 'two'],
  takeaways: ['do it'],
})

const item = { title: 'Vid', content: 'bare' }

beforeEach(() => {
  vi.mocked(aiChat).mockReset()
  vi.mocked(loadSourceText).mockReset()
  vi.mocked(loadSourceText).mockResolvedValue({ text: 'short transcript', basis: 'transcript', truncated: false, channel: 'Ch' })
})

function answer(raw: string, model = 'llama3.2') {
  vi.mocked(aiChat).mockImplementation(async (_p, _s, _f, _o, _sig, opts) => {
    opts?.onProvider?.({ provider: 'ollama', model })
    return raw
  })
}

describe('parseExplanation', () => {
  it('keeps only non-empty string list entries', () => {
    expect(parseExplanation(GOOD)).toEqual({ summary: 'It explains X.', keyPoints: ['a', 'b'], steps: ['one', 'two'], takeaways: ['do it'] })
  })
  it('rejects bad JSON, non-objects and a missing summary', () => {
    expect(parseExplanation('nope')).toBeNull()
    expect(parseExplanation('[]')).toBeNull()
    expect(parseExplanation('{"keyPoints":["a"]}')).toBeNull()
  })
  it('caps list lengths', () => {
    const many = Array.from({ length: 30 }, (_, i) => `p${i}`)
    const out = parseExplanation(JSON.stringify({ summary: 's', keyPoints: many, steps: many, takeaways: many }))!
    expect(out.keyPoints).toHaveLength(8)
    expect(out.steps).toHaveLength(20)
    expect(out.takeaways).toHaveLength(5)
  })
})

describe('explainItem', () => {
  it('makes a single JSON call for short text and records provenance', async () => {
    answer(GOOD)
    const out = await explainItem(item, { cloudSafe: true })
    expect(aiChat).toHaveBeenCalledTimes(1)
    const [prompt, , format, , , opts] = vi.mocked(aiChat).mock.calls[0]
    expect(prompt).toContain('short transcript')
    expect(prompt).toContain('Channel: Ch')
    expect(format).toBe('json')
    expect(opts).toMatchObject({ task: 'explain', userInitiated: true, cloudSafe: true })
    expect(out).toMatchObject({ summary: 'It explains X.', model: 'ollama:llama3.2', basis: 'transcript', truncated: false })
    expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('map-reduces long text: one call per chunk plus one JSON reduce', async () => {
    const long = Array.from({ length: 1500 }, (_, i) => `Sentence ${i}.`).join(' ')
    vi.mocked(loadSourceText).mockResolvedValue({ text: long, basis: 'transcript', truncated: true })
    answer(GOOD)
    const out = await explainItem(item, { cloudSafe: true })
    const calls = vi.mocked(aiChat).mock.calls
    expect(calls.length).toBeGreaterThan(2)
    expect(calls.slice(0, -1).every(c => c[2] === undefined)).toBe(true) // map calls: free text
    expect(calls.at(-1)![2]).toBe('json') // reduce call
    expect(calls.at(-1)![0]).toContain('Notes from each part')
    expect(out.truncated).toBe(true)
  })

  it('passes the explicit provider and the cloudSafe verdict through', async () => {
    answer(GOOD)
    await explainItem(item, { provider: 'claude', cloudSafe: false })
    expect(vi.mocked(aiChat).mock.calls[0][5]).toMatchObject({ provider: 'claude', cloudSafe: false })
  })

  it('throws ExplainParseError when the model answer is unusable', async () => {
    answer('not json')
    await expect(explainItem(item, { cloudSafe: true })).rejects.toThrow(ExplainParseError)
  })

  it('propagates provider errors untouched', async () => {
    vi.mocked(aiChat).mockRejectedValue(new Error('boom'))
    await expect(explainItem(item, { cloudSafe: true })).rejects.toThrow('boom')
  })
})
