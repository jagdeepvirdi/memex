// On-demand "Explain this" for a saved video / page. Map-reduce so long transcripts fit a small
// local model: each chunk is condensed to notes, then the notes are merged into one structured
// explanation. Only runs when the user clicks — never as background work.

import { aiChat, type AiCallOptions } from './ai.js'
import { loadSourceText, chunkText, type SourceItem } from './itemSource.js'
import type { ExplanationData } from '../../../shared/types.js'

export type ExplainStage = 'reading' | 'summarising' | 'writing'

/** Where a long explanation has got to. `done` of `total` steps; `part`/`parts` only while summarising. */
export interface ExplainProgress {
  stage: ExplainStage
  done: number
  total: number
  part?: number
  parts?: number
}

export interface ExplainOptions {
  /** Called as each step starts and finishes. Must never throw (errors in it are ignored). */
  onProgress?: (p: ExplainProgress) => void
  provider?: AiCallOptions['provider']
  /** Result of cloudSafe(item); false pins every call to Ollama. */
  cloudSafe: boolean
  signal?: AbortSignal
}

// Notes are an intermediate step the final pass re-reads, so they are kept short: on a local model, output
// tokens are what the wait is made of.
const MAP_SYSTEM =
  'You condense one part of a longer transcript or article into factual notes, written in English. ' +
  'Return at most 6 short bullets (under 20 words each) with the concrete points, steps and facts in THIS part. ' +
  'Do not add anything that is not in the text.'
const MAP_MAX_TOKENS = 350

const REDUCE_SYSTEM =
  'You explain a video or article clearly for someone deciding whether and how to use it. ' +
  'Always write in English, even if the source text is in another language. ' +
  'Use ONLY the supplied text. Never invent facts. Return JSON: ' +
  '{"summary": "2-4 sentence plain-English explanation", ' +
  '"keyPoints": ["the main ideas, max 8, each one a complete sentence that says something specific (not a bare topic name)"], ' +
  '"steps": ["ordered how-to steps, or [] if the source is not instructional"], ' +
  '"takeaways": ["what to remember or do next, max 5"]}'

const MAX_LIST = 8
/** How much of the video description goes into the prompt alongside the transcript. */
const DESCRIPTION_CHARS = 2000

function asStringList(v: unknown, max = MAX_LIST): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, max)
}

/** Parses the model's JSON; returns null when it isn't usable so the caller can fail loudly. */
export function parseExplanation(raw: string): Pick<ExplanationData, 'summary' | 'keyPoints' | 'steps' | 'takeaways'> | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const summary = typeof o.summary === 'string' ? o.summary.trim() : ''
  if (!summary) return null
  return {
    summary,
    keyPoints: asStringList(o.keyPoints),
    steps: asStringList(o.steps, 20),
    takeaways: asStringList(o.takeaways, 5),
  }
}

export class ExplainParseError extends Error {
  constructor() {
    super('The AI did not return a usable explanation. Try again or pick a different provider.')
    this.name = 'ExplainParseError'
  }
}

export async function explainItem(item: SourceItem, opts: ExplainOptions): Promise<ExplanationData> {
  const report = (p: ExplainProgress) => {
    try { opts.onProgress?.(p) } catch { /* progress must never break the work */ }
  }
  report({ stage: 'reading', done: 0, total: 1 })
  const source = await loadSourceText(item)
  let used = ''
  const call: AiCallOptions = {
    task: 'explain',
    provider: opts.provider,
    cloudSafe: opts.cloudSafe,
    userInitiated: true,
    onProvider: i => { used = `${i.provider}:${i.model}` },
  }

  const header = [
    `Title: ${item.title}`,
    source.channel && `Channel: ${source.channel}`,
    // Skipped when the description IS the source text (no transcript), so it is not sent twice.
    source.description && source.basis !== 'description' && `Video description:\n${source.description.slice(0, DESCRIPTION_CHARS)}`,
  ].filter(Boolean).join('\n')
  const chunks = chunkText(source.text)
  const parts = chunks.length
  // One step per part, plus the final write-up. A short source is just that one step.
  const total = parts > 1 ? parts + 1 : 1

  let material: string
  if (parts === 1) {
    material = chunks[0]
  } else {
    const notes: string[] = []
    for (let i = 0; i < parts; i++) {
      report({ stage: 'summarising', done: i, total, part: i + 1, parts })
      const out = await aiChat(
        `${header}\n\nPart ${i + 1} of ${parts}:\n${chunks[i]}`,
        MAP_SYSTEM,
        undefined,
        { temperature: 0, num_predict: MAP_MAX_TOKENS },
        opts.signal,
        call,
      )
      notes.push(`Part ${i + 1}:\n${out.trim()}`)
    }
    material = notes.join('\n\n')
  }
  report({ stage: 'writing', done: total - 1, total })

  const raw = await aiChat(
    `${header}\n\n${chunks.length > 1 ? 'Notes from each part of the source' : 'Source text'}:\n${material}`,
    REDUCE_SYSTEM,
    'json',
    { temperature: 0, num_predict: 1200 },
    opts.signal,
    call,
  )

  const parsed = parseExplanation(raw)
  if (!parsed) throw new ExplainParseError()
  report({ stage: 'writing', done: total, total })

  return {
    ...parsed,
    model: used || 'unknown',
    generatedAt: new Date().toISOString(),
    basis: source.basis,
    truncated: source.truncated,
  }
}
