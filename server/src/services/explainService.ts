// On-demand "Explain this" for a saved video / page. Map-reduce so long transcripts fit a small
// local model: each chunk is condensed to notes, then the notes are merged into one structured
// explanation. Only runs when the user clicks — never as background work.

import { aiChat, type AiCallOptions } from './ai.js'
import { loadSourceText, chunkText, type SourceItem } from './itemSource.js'
import type { ExplanationData } from '../../../shared/types.js'

export interface ExplainOptions {
  provider?: AiCallOptions['provider']
  /** Result of cloudSafe(item); false pins every call to Ollama. */
  cloudSafe: boolean
  signal?: AbortSignal
}

const MAP_SYSTEM =
  'You condense one part of a longer transcript or article into factual notes. ' +
  'Return only a short bullet list of the concrete points, steps and facts in THIS part. ' +
  'Do not add anything that is not in the text.'

const REDUCE_SYSTEM =
  'You explain a video or article clearly for someone deciding whether and how to use it. ' +
  'Use ONLY the supplied text. Never invent facts. Return JSON: ' +
  '{"summary": "2-4 sentence plain-English explanation", ' +
  '"keyPoints": ["the main ideas, max 8"], ' +
  '"steps": ["ordered how-to steps, or [] if the source is not instructional"], ' +
  '"takeaways": ["what to remember or do next, max 5"]}'

const MAX_LIST = 8

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
  const source = await loadSourceText(item)
  let used = ''
  const call: AiCallOptions = {
    task: 'explain',
    provider: opts.provider,
    cloudSafe: opts.cloudSafe,
    userInitiated: true,
    onProvider: i => { used = `${i.provider}:${i.model}` },
  }

  const header = [`Title: ${item.title}`, source.channel && `Channel: ${source.channel}`].filter(Boolean).join('\n')
  const chunks = chunkText(source.text)

  let material: string
  if (chunks.length === 1) {
    material = chunks[0]
  } else {
    const notes: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      const out = await aiChat(
        `${header}\n\nPart ${i + 1} of ${chunks.length}:\n${chunks[i]}`,
        MAP_SYSTEM,
        undefined,
        { temperature: 0, num_predict: 600 },
        opts.signal,
        call,
      )
      notes.push(`Part ${i + 1}:\n${out.trim()}`)
    }
    material = notes.join('\n\n')
  }

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

  return {
    ...parsed,
    model: used || 'unknown',
    generatedAt: new Date().toISOString(),
    basis: source.basis,
    truncated: source.truncated,
  }
}
