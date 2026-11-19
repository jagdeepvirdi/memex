import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index'

vi.mock('../db/client', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }))
vi.mock('../services/markitdown', () => ({
  convertToMarkdown: vi.fn(),
  checkMarkitdownInstalled: vi.fn().mockResolvedValue(false),
  SUPPORTED_MIME_TYPES: [],
}))
vi.mock('../services/whisperService', () => ({
  transcribeAudio: vi.fn(),
  checkWhisperInstalled: vi.fn().mockResolvedValue(false),
  isAudioMime: vi.fn(),
}))

let AUTH = ''
beforeAll(() => {
  AUTH = `Bearer ${jwt.sign({ userId: 'u1', email: 't@t.com' }, process.env.JWT_SECRET || 'memex-default-secret')}`
})
beforeEach(() => { delete process.env.MEMEX_IN_DOCKER })
afterEach(() => { delete process.env.MEMEX_IN_DOCKER })

const get = (path: string) => request(app).get(path).set('Authorization', AUTH)

describe('optional tool health routes', () => {
  it.each(['/api/ingest/markitdown/health', '/api/ingest/whisper/health'])('%s reports not installed and not in Docker by default', async (path) => {
    const res = await get(path)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ installed: false, inDocker: false })
  })

  it.each(['/api/ingest/markitdown/health', '/api/ingest/whisper/health'])('%s says it runs in the Docker image when MEMEX_IN_DOCKER=1', async (path) => {
    process.env.MEMEX_IN_DOCKER = '1'
    const res = await get(path)
    expect(res.body.inDocker).toBe(true)
  })
})
