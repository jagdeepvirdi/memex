import { getSetting } from './settings.js'

const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434'

// Priority order — better models first
const PREFERRED_VISION_MODELS = [
  'llama3.2-vision:11b',
  'llama3.2-vision',
  'llava:13b',
  'llava:7b',
  'llava',
  'moondream',
]

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
])

export function isImageMime(mimetype: string): boolean {
  return IMAGE_MIME_TYPES.has(mimetype)
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>
}

/**
 * Returns the name of the best available vision model in Ollama,
 * or null if none is installed.
 */
export async function getAvailableVisionModel(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null

    const data = (await res.json()) as OllamaTagsResponse
    const installedNames = data.models.map(m => m.name)

    // Check for explicit user preference first
    const preferred = await getSetting('vision_model', '')
    if (preferred && installedNames.some(n => n === preferred)) return preferred

    // Fall back to best available from priority list
    for (const candidate of PREFERRED_VISION_MODELS) {
      const match = installedNames.find(n => n === candidate || n.startsWith(candidate + ':'))
      if (match) return match
    }

    return null
  } catch {
    return null
  }
}

const VISION_PROMPT = `Describe this image in detail. Extract and report everything you can see:

- All visible text: labels, signs, menus, captions, headings, bullet points, prices, dates, names
- Structured data: tables, lists, receipts, forms, schedules
- Type of image: photo, screenshot, diagram, receipt, menu, document, whiteboard, handwritten note, etc.
- Key subjects, objects, people, or places
- Any other notable information

Be thorough — your description will be used to classify and store this content in a knowledge base.`

interface OllamaChatResponse {
  message: { content: string }
}

/**
 * Sends an image buffer to the Ollama vision model and returns a text description.
 * Throws if no vision model is installed.
 */
export async function describeImage(buffer: Buffer, filename: string): Promise<string> {
  const model = await getAvailableVisionModel()

  if (!model) {
    throw new Error(
      'No vision model found in Ollama. Pull one with:\n' +
      '  docker exec -it memex-ollama-1 ollama pull llava:7b\n' +
      'Or for better quality:\n' +
      '  docker exec -it memex-ollama-1 ollama pull llama3.2-vision:11b'
    )
  }

  const base64 = buffer.toString('base64')

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.1 },
      messages: [
        {
          role: 'user',
          content: VISION_PROMPT,
          images: [base64],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Ollama vision request failed: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as OllamaChatResponse
  const description = data.message.content.trim()

  if (!description) {
    throw new Error('Vision model returned an empty description')
  }

  return description
}
