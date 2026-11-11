import { pool } from '../db/client.js'
import { aiChat } from './ai.js'
import type { Insight } from '../../../shared/types.js'
import logger from '../lib/logger.js'

const INSIGHT_SYSTEM_PROMPT = `You are a personal knowledge assistant. Analyze the following notes and items from the user's library.
Identify 1-3 highly relevant, near-term actionable insights, recurring patterns, or interesting connections.

Types of insights:
- 'event': Upcoming flights, reservations, appointments, or deadlines.
- 'habit': Recurring themes (e.g. 'You've saved 3 sourdough recipes this week').
- 'connection': Links between separate notes (e.g. 'This restaurant note is near the hotel you booked').
- 'suggestion': Small actions (e.g. 'You have 5 unread articles on AI').

Return ONLY a JSON array of Insight objects:
[{ "id": "1", "title": "", "description": "", "type": "event|habit|connection|suggestion", "priority": 1-5 }]
No preamble, no explanation.`

// Insights come from an LLM call, which is slow and non-deterministic. Without
// caching, every Dashboard load re-ran the model (and abandoned calls kept
// running in Ollama, queueing behind each other).
const INSIGHTS_TTL_MS = 60 * 60 * 1000        // good result: reuse for an hour
const INSIGHTS_FAILURE_TTL_MS = 2 * 60 * 1000 // timeout / bad output: back off briefly
const AI_TIMEOUT_MS = 30_000

interface CacheEntry {
  value: Insight[]
  expiresAt: number
}

interface ComputeResult {
  insights: Insight[]
  /** How long to cache this result; undefined means do not cache. */
  ttlMs?: number
}

let cache: CacheEntry | null = null
let inflight: Promise<Insight[]> | null = null

/** Clears the cached result and any in-flight call (used by tests). */
export function resetInsightsCache(): void {
  cache = null
  inflight = null
}

function isInsight(value: unknown): value is Insight {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.title === 'string' && typeof v.description === 'string'
}

async function computeInsights(): Promise<ComputeResult> {
  // Hold the DB connection only for the query, not for the (slow) model call.
  const client = await pool.connect()
  let items: Array<{ title: string; summary: string | null; type: string }>
  try {
    // Fetch recent and random items to find connections
    const result = await client.query(`
      (SELECT title, structured->>'summary' as summary, type, created_at
       FROM items
       WHERE reviewed = true AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 20)
      UNION ALL
      (SELECT title, structured->>'summary' as summary, type, created_at
       FROM items
       WHERE reviewed = true AND deleted_at IS NULL
       ORDER BY RANDOM() LIMIT 10)
    `)
    items = result.rows
  } finally {
    client.release()
  }

  if (items.length < 5) return { insights: [] }

  const content = items.map(i => `- [${i.type}] ${i.title}: ${i.summary || ''}`).join('\n')
  const prompt = `Analyze these items and surface 1-3 insights:\n\n${content}`

  // Abort the request on timeout so Ollama stops generating for a caller that
  // has already given up (Promise.race alone left the call running).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  let raw: string
  try {
    raw = await aiChat(prompt, INSIGHT_SYSTEM_PROMPT, 'json', { temperature: 0.2 }, controller.signal)
  } catch {
    return { insights: [], ttlMs: INSIGHTS_FAILURE_TTL_MS }
  } finally {
    clearTimeout(timer)
  }

  try {
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1) return { insights: [], ttlMs: INSIGHTS_FAILURE_TTL_MS }
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(parsed)) return { insights: [], ttlMs: INSIGHTS_FAILURE_TTL_MS }
    const insights = parsed.filter(isInsight).slice(0, 3) // Max 3 insights
    return { insights, ttlMs: insights.length > 0 ? INSIGHTS_TTL_MS : INSIGHTS_FAILURE_TTL_MS }
  } catch (err) {
    logger.error(err, 'Failed to parse insights JSON')
    return { insights: [], ttlMs: INSIGHTS_FAILURE_TTL_MS }
  }
}

export async function generateInsights(): Promise<Insight[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  // Concurrent callers (e.g. React StrictMode double-fetch, two tabs) share one model call.
  if (inflight) return inflight

  const run = computeInsights()
    .then(({ insights, ttlMs }) => {
      if (ttlMs !== undefined) cache = { value: insights, expiresAt: Date.now() + ttlMs }
      return insights
    })
    .finally(() => {
      if (inflight === run) inflight = null
    })
  inflight = run
  return run
}
