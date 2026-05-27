import Anthropic from '@anthropic-ai/sdk'
import { ollamaChat, ollamaEmbed } from './ollama.js'

// Route through Claude API only when explicitly opted in.
// Anthropic has no public embeddings endpoint, so aiEmbed always uses Ollama.
function useClaude(): boolean {
  return process.env.USE_CLAUDE === 'true' && !!process.env.ANTHROPIC_API_KEY
}

let _anthropic: Anthropic | null = null

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

export async function aiChat(prompt: string, system?: string): Promise<string> {
  if (useClaude()) {
    const client = getAnthropicClient()
    const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'

    const message = await client.messages.create({
      model,
      max_tokens: 2048,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    })

    const block = message.content[0]
    if (block.type !== 'text') {
      throw new Error(`Unexpected Claude response block type: ${block.type}`)
    }
    return block.text
  }

  return ollamaChat(prompt, system)
}

// Embeddings always go through Ollama — Anthropic has no embeddings API.
export async function aiEmbed(text: string): Promise<number[]> {
  return ollamaEmbed(text)
}

export function activeProvider(): 'claude' | 'ollama' {
  return useClaude() ? 'claude' : 'ollama'
}
