import { pool } from '../db/client.js'
import { rowToItem } from '../db/helpers.js'
import { embedQuery } from './embedder.js'
import { aiChat } from './ai.js'
import type { Item, AskResponse } from '../../../shared/types.js'

const RAG_SYSTEM_PROMPT = `You are Memex AI, a helpful personal knowledge assistant. 
Use the provided notes and items (the Context) to answer the user's question.

Rules:
1. Answer strictly based on the Context. If the information isn't there, say you don't know.
2. Include citations in the format [1], [2] at the end of relevant sentences.
3. Be concise but thorough.
4. If multiple sources conflict, mention both.
5. Do not invent facts or mention things outside your provided Context.`

export async function askKnowledge(question: string): Promise<AskResponse> {
  // 1. Retrieve relevant context
  const vector = await embedQuery(question)
  const vectorStr = JSON.stringify(vector)

  // Top 10 context items
  const sql = `
    SELECT
      i.id, i.title, i.type, i.content, i.structured,
      i.source, i.source_url, i.encrypted, i.created_at, i.updated_at,
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
      ) AS tags,
      (
        0.7 * (1 - (i.embedding <=> $1::vector)) +
        0.3 * ts_rank_cd(to_tsvector('english', i.title || ' ' || i.content), plainto_tsquery('english', $2))
      ) AS rank
    FROM items i
    WHERE i.deleted_at IS NULL AND i.embedding IS NOT NULL
    ORDER BY rank DESC
    LIMIT 10
  `
  
  const { rows } = await pool.query(sql, [vectorStr, question])
  const sources = rows.map(rowToItem)

  if (sources.length === 0) {
    return {
      answer: "I couldn't find any relevant notes in your library to answer this question.",
      sources: []
    }
  }

  // 2. Construct context for LLM
  const contextBlock = sources
    .map((s, i) => `[${i + 1}] Title: ${s.title}\nContent: ${s.content.slice(0, 1000)}\n---`)
    .join('\n\n')

  const prompt = `Context:\n${contextBlock}\n\nQuestion: ${question}\n\nAnswer:`

  // 3. Generate synthesized answer
  // We use the active provider (Ollama/Claude) and preferred model from settings
  const answer = await aiChat(prompt, RAG_SYSTEM_PROMPT)

  return {
    answer,
    sources
  }
}
