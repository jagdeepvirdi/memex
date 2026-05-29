import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('child_process', () => ({ spawn: vi.fn() }))
import { spawn } from 'child_process'
import { isAudioMime, checkWhisperInstalled } from './whisperService'

beforeEach(() => vi.clearAllMocks())

describe('isAudioMime', () => {
  it('accepts common audio types', () => {
    expect(isAudioMime('audio/webm')).toBe(true)
    expect(isAudioMime('audio/mpeg')).toBe(true)
    expect(isAudioMime('audio/wav')).toBe(true)
    expect(isAudioMime('audio/x-m4a')).toBe(true)
  })
  it('accepts any audio/* via prefix', () => {
    expect(isAudioMime('audio/something-new')).toBe(true)
  })
  it('rejects non-audio types', () => {
    expect(isAudioMime('image/png')).toBe(false)
    expect(isAudioMime('application/pdf')).toBe(false)
  })
})

describe('checkWhisperInstalled', () => {
  it('resolves true when the whisper CLI exits 0', async () => {
    const proc = new EventEmitter() as any
    vi.mocked(spawn).mockReturnValueOnce(proc)
    const p = checkWhisperInstalled()
    proc.emit('close', 0)
    expect(await p).toBe(true)
  })

  it('resolves false when the CLI exits non-zero', async () => {
    const proc = new EventEmitter() as any
    vi.mocked(spawn).mockReturnValueOnce(proc)
    const p = checkWhisperInstalled()
    proc.emit('close', 1)
    expect(await p).toBe(false)
  })

  it('resolves false when the binary is missing (spawn error)', async () => {
    const proc = new EventEmitter() as any
    vi.mocked(spawn).mockReturnValueOnce(proc)
    const p = checkWhisperInstalled()
    proc.emit('error', new Error('ENOENT'))
    expect(await p).toBe(false)
  })
})
