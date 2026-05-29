import { pool } from '../db/client.js'
import { aiChat } from './ai.js'
import type { Insight } from '../../../shared/types.js'

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

export async function generateInsights(): Promise<Insight[]> {
  const client = await pool.connect()
  try {
    // 1. Fetch recent and random items to find connections
    const { rows: items } = await client.query(`
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

    if (items.length < 5) return []

    const content = items.map(i => `- [${i.type}] ${i.title}: ${i.summary || ''}`).join('\n')
    const prompt = `Analyze these items and surface 1-3 insights:\n\n${content}`

    const raw = await aiChat(prompt, INSIGHT_SYSTEM_PROMPT, 'json', { temperature: 0.2 })
    
    try {
      const start = raw.indexOf('[')
      const end = raw.lastIndexOf(']')
      if (start === -1) return []
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Insight[]
      return parsed.slice(0, 3) // Max 3 insights
    } catch (err) {
      console.error('Failed to parse insights JSON:', err)
      return []
    }
  } finally {
    client.release()
  }
}
