import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

export const SUPPORTED_EXTENSIONS = [
  '.pdf', '.docx', '.doc', '.pptx', '.ppt',
  '.xlsx', '.xls', '.csv',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.html', '.htm', '.xml', '.json',
  '.epub', '.txt', '.md',
]

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv', 'text/html', 'text/plain', 'text/xml',
  'application/json',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'application/epub+zip',
]

/** Check whether markitdown CLI is installed and callable. */
export async function checkMarkitdownInstalled(): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('markitdown', ['--help'])
    proc.on('close', code => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Convert any supported file buffer to Markdown text via the markitdown CLI.
 * Writes a temp file, calls markitdown, then cleans up.
 */
export async function convertToMarkdown(buffer: Buffer, filename: string): Promise<string> {
  const tmpPath = join(tmpdir(), `memex-${randomUUID()}-${filename}`)
  await writeFile(tmpPath, buffer)

  try {
    return await new Promise<string>((resolve, reject) => {
      const proc = spawn('markitdown', [tmpPath])
      let output = ''
      let error = ''

      proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
      proc.stderr.on('data', (chunk: Buffer) => { error += chunk.toString() })

      proc.on('close', code => {
        if (code !== 0) {
          reject(new Error(`markitdown exited ${code}: ${error.trim()}`))
        } else {
          resolve(output)
        }
      })

      proc.on('error', () => {
        reject(new Error("markitdown not found. Install it with: pip install 'markitdown[all]'"))
      })
    })
  } finally {
    await unlink(tmpPath).catch(() => {}) // always clean up temp file
  }
}
