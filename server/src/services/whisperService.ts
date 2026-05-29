import { spawn } from 'child_process'
import { writeFile, unlink, readFile, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'

// Local transcription via the openai-whisper CLI (pip install openai-whisper).
// Mirrors the MarkItDown spawn-a-CLI pattern. Fully local, zero API cost.
// Note: Ollama has no audio transcription endpoint, so we use Whisper directly.

const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'base'

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/flac', 'audio/aac',
]

export function isAudioMime(mimetype: string): boolean {
  return mimetype.startsWith('audio/') || SUPPORTED_AUDIO_MIME_TYPES.includes(mimetype)
}

/** Check whether the whisper CLI is installed and callable. */
export async function checkWhisperInstalled(): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('whisper', ['--help'])
    proc.on('close', code => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Transcribe an audio buffer to text via the whisper CLI.
 * Whisper writes a .txt sidecar into an output dir; we read and return it.
 */
export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  // Whisper infers format from extension, so preserve it (default to .webm from MediaRecorder)
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.webm'
  const safeName = `memex-${randomUUID()}${ext}`
  const tmpAudioPath = join(tmpdir(), safeName)
  const outDir = await mkdtemp(join(tmpdir(), 'memex-whisper-'))

  await writeFile(tmpAudioPath, buffer)

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('whisper', [
        tmpAudioPath,
        '--model', WHISPER_MODEL,
        '--output_format', 'txt',
        '--output_dir', outDir,
        '--fp16', 'False',  // CPU-safe; avoids fp16 warning/errors on non-GPU
      ])
      let error = ''
      proc.stderr.on('data', (chunk: Buffer) => { error += chunk.toString() })

      proc.on('close', code => {
        if (code !== 0) reject(new Error(`whisper exited ${code}: ${error.trim().slice(0, 500)}`))
        else resolve()
      })
      proc.on('error', () => {
        reject(new Error('whisper not found. Install it with: pip install openai-whisper'))
      })
    })

    // Whisper names the output after the input file's base name, with .txt
    const txtName = basename(safeName, ext) + '.txt'
    const transcript = await readFile(join(outDir, txtName), 'utf8')
    return transcript.trim()
  } finally {
    await unlink(tmpAudioPath).catch(() => {})
    await rm(outDir, { recursive: true, force: true }).catch(() => {})
  }
}
