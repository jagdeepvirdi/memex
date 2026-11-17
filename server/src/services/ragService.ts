import { retrieveItems } from './retrievalService.js'
import { aiChat } from './ai.js'
import { allCloudSafe } from './cloudSafe.js'
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
  // 1. Retrieve relevant context: top 10 by hybrid vector + full-text rank, keyword-only when no vectors can be used
  const { items: sources, semantic } = await retrieveItems({ query: question, limit: 10, requireVector: true })

  if (sources.length === 0) {
    return {
      answer: "I couldn't find any relevant notes in your library to answer this question.",
      sources: [],
      semantic,
    }
  }

  // 2. Construct context for LLM
  const contextBlock = sources
    .map((s, i) => `[${i + 1}] Title: ${s.title}\nContent: ${s.content.slice(0, 1000)}\n---`)
    .join('\n\n')

  const prompt = `Context:\n${contextBlock}\n\nQuestion: ${question}\n\nAnswer:`

  // 3. Generate synthesized answer
  // Uses the configured provider/model; stays on local Ollama if any retrieved source is private.
  const answer = await aiChat(prompt, RAG_SYSTEM_PROMPT, undefined, undefined, undefined, {
    task: 'ask',
    cloudSafe: allCloudSafe(sources),
  })

  return {
    answer,
    sources,
    semantic,
  }
}
