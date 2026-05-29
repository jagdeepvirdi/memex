const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'llama3.2'
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'

interface OllamaChatResponse {
  message: { content: string }
}

interface OllamaEmbedResponse {
  embedding: number[]
}

export async function ollamaChat(
  prompt: string, 
  system?: string, 
  model?: string,
  format?: string | object,
  options?: Record<string, any>
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || CHAT_MODEL,
      stream: false,
      format,
      options: {
        temperature: 0, // Default to deterministic for extraction
        ...options
      },
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Ollama chat request failed: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as OllamaChatResponse
  return data.message.content
}

export async function ollamaEmbed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      prompt: text,
    }),
  })

  if (!res.ok) {
    throw new Error(`Ollama embed request failed: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as OllamaEmbedResponse
  return data.embedding
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}
