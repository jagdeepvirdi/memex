import { OLLAMA_EMBED_MODEL as EMBED_MODEL } from '../lib/embeddingModel.js'
const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'llama3.2'

// Safety bounds for chat calls; callers may override num_predict via `options` or pass their own signal.
const NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT ?? 2048)
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 180_000)

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
  options?: Record<string, any>,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Without a bound, one degenerate generation (e.g. a JSON-mode loop) hangs the
    // call forever and blocks every request queued behind it on the same model.
    signal: signal ?? AbortSignal.timeout(CHAT_TIMEOUT_MS),
    body: JSON.stringify({
      model: model || CHAT_MODEL,
      stream: false,
      format,
      options: {
        temperature: 0, // Default to deterministic for extraction
        num_predict: NUM_PREDICT, // Ollama's default is unlimited
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

/** Names of locally installed Ollama models (for the Settings picker). Empty if Ollama is unreachable. */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: Array<{ name?: unknown }> }
    return (data.models ?? []).map(m => m.name).filter((n): n is string => typeof n === 'string')
  } catch {
    return []
  }
}
