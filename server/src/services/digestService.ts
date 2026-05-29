import { pool } from '../db/client.js'
import { rowToItem } from '../db/helpers.js'
import { aiChat } from './ai.js'
import type { Item, DigestResponse, DigestConnection } from '../../../shared/types.js'

const CONNECTION_PROMPT = `You are a personal knowledge assistant.
Given two notes from someone's knowledge base, reveal ONE surprising or non-obvious connection between them.
Write a single sentence (max 40 words). Be specific — name the actual theme, pattern, or tension.
Do not say "both notes discuss" — show the insight. Return ONLY the sentence.`

const ITEM_COLS = `
  i.id, i.title, i.type, i.content, i.structured,
  i.source, i.source_url, i.encrypted, i.reviewed,
  i.created_at, i.updated_at, i.confidence, i.remind_at,
  COALESCE(
    (SELECT array_agg(c.name ORDER BY ic2.depth)
     FROM item_categories ic2
     JOIN categories c ON c.id = ic2.category_id
     WHERE ic2.item_id = i.id),
    '{}'::text[]
  ) AS categories,
  COALESCE(
    (SELECT array_agg(t.name ORDER BY t.name)
     FROM item_tags it2
     JOIN tags t ON t.id = it2.tag_id
     WHERE it2.item_id = i.id),
    '{}'::text[]
  ) AS tags
`

async function generateConnection(candidates: Item[]): Promise<DigestConnection | null> {
  if (candidates.length < 2) return null

  // Prefer pairing items of different types for cross-domain insight
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const item1 = shuffled[0]
  const item2 = shuffled.find(i => i.type !== item1.type && i.id !== item1.id)
    ?? shuffled.find(i => i.id !== item1.id)
  if (!item2) return null

  const s1 = (item1.structured as Record<string, unknown>)?.summary as string ?? item1.content.slice(0, 300)
  const s2 = (item2.structured as Record<string, unknown>)?.summary as string ?? item2.content.slice(0, 300)

  const prompt =
    `Note 1 — "${item1.title}" (${item1.type}):\n${s1}\n\n` +
    `Note 2 — "${item2.title}" (${item2.type}):\n${s2}\n\n` +
    `What is the unexpected connection?`

  try {
    const insight = await aiChat(prompt, CONNECTION_PROMPT, undefined, { temperature: 0.4 })
    return {
      item1: { id: item1.id, title: item1.title, type: item1.type, summary: s1 },
      item2: { id: item2.id, title: item2.title, type: item2.type, summary: s2 },
      insight: insight.trim(),
    }
  } catch {
    return null
  }
}

export async function generateDigest(): Promise<DigestResponse> {
  const client = await pool.connect()
  try {
    // ── This week's items ────────────────────────────────────────────────────
    const { rows: recentRows } = await client.query(
      `SELECT ${ITEM_COLS} FROM items i
       WHERE i.deleted_at IS NULL AND i.created_at >= NOW() - INTERVAL '7 days'
       ORDER BY i.created_at DESC LIMIT 12`,
    )
    const recentItems = recentRows.map(rowToItem)

    // ── Week-over-week counts ────────────────────────────────────────────────
    const { rows: countRows } = await client.query<{
      this_week: string; prev_week: string
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')              AS this_week,
        COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days'
                                               AND NOW() - INTERVAL '7 days')        AS prev_week
      FROM items WHERE deleted_at IS NULL
    `)
    const weekCount = parseInt(countRows[0].this_week, 10)
    const prevWeekCount = parseInt(countRows[0].prev_week, 10)

    // ── On this day ──────────────────────────────────────────────────────────
    const { rows: onThisDayRows } = await client.query(
      `SELECT ${ITEM_COLS} FROM items i
       WHERE i.deleted_at IS NULL
         AND EXTRACT(MONTH FROM i.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(DAY   FROM i.created_at) = EXTRACT(DAY   FROM CURRENT_DATE)
         AND EXTRACT(YEAR  FROM i.created_at) < EXTRACT(YEAR  FROM CURRENT_DATE)
       ORDER BY RANDOM() LIMIT 1`,
    )
    const onThisDayItem = onThisDayRows.length > 0 ? rowToItem(onThisDayRows[0]) : null
    const onThisDay = onThisDayItem
      ? {
          type: 'on-this-day' as const,
          reason: `Saved ${new Date().getFullYear() - new Date(onThisDayItem.createdAt).getFullYear()} year${new Date().getFullYear() - new Date(onThisDayItem.createdAt).getFullYear() > 1 ? 's' : ''} ago today`,
          item: onThisDayItem,
        }
      : null

    // ── Random reviewed items for connection ─────────────────────────────────
    const { rows: randomRows } = await client.query(
      `SELECT ${ITEM_COLS} FROM items i
       WHERE i.deleted_at IS NULL AND i.reviewed = true
         AND i.structured != '{}'::jsonb
       ORDER BY RANDOM() LIMIT 10`,
    )
    const connection = await generateConnection(randomRows.map(rowToItem))

    // ── Period label ─────────────────────────────────────────────────────────
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - 6)
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const period = `${fmt(weekStart)} – ${fmt(now)}, ${now.getFullYear()}`

    return { period, recentItems, weekCount, prevWeekCount, onThisDay, connection }
  } finally {
    client.release()
  }
}
