import Anthropic from '@anthropic-ai/sdk'
import { ollamaChat, ollamaEmbed } from './ollama.js'
import { getAiConfig } from './settings.js'

// Route through Claude API only when explicitly opted in.
// Anthropic has no public embeddings endpoint, so aiEmbed always uses Ollama.
async function useClaude(): Promise<boolean> {
  const config = await getAiConfig()
  return config.useClaude === true && !!process.env.ANTHROPIC_API_KEY
}

let _anthropic: Anthropic | null = null

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

export async function aiChat(
  prompt: string, 
  system?: string, 
  format?: string | object,
  options?: Record<string, any>
): Promise<string> {
  const config = await getAiConfig()

  if (config.useClaude && !!process.env.ANTHROPIC_API_KEY) {
    const client = getAnthropicClient()
    const model = process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20240620'

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

  return ollamaChat(prompt, system, config.model, format, options)
}

// Embeddings always go through Ollama — Anthropic has no embeddings API.
export async function aiEmbed(text: string): Promise<number[]> {
  return ollamaEmbed(text)
}

export async function activeProvider(): Promise<'claude' | 'ollama'> {
  return (await useClaude()) ? 'claude' : 'ollama'
}
