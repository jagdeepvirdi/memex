import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import express from 'express'
import request from 'supertest'
import { clientDistDir, mountClient, shouldServeClient } from './serveClient'

let dir = ''
let empty = ''
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'memex-client-'))
  empty = await mkdtemp(join(tmpdir(), 'memex-noclient-'))
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>Memex</title><div id="root"></div>')
  await writeFile(join(dir, 'assets', 'app-abc123.js'), 'console.log("hi")')
  await writeFile(join(dir, 'manifest.webmanifest'), '{}')
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(empty, { recursive: true, force: true })
})

/** An app shaped like the real one: the client is mounted first, then an API that needs a "session". */
function makeApp() {
  const app = express()
  mountClient(app, dir)
  app.use((req, res, next) => (req.headers.authorization ? next() : res.status(401).json({ error: 'Unauthorized' })))
  app.get('/api/ping', (_req, res) => res.json({ pong: true }))
  return app
}

describe('mountClient', () => {
  it('serves the app without a session', async () => {
    const res = await request(makeApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toContain('<div id="root">')
  })

  it('serves client-side routes by returning the app (single-page fallback)', async () => {
    for (const path of ['/settings/ai', '/item/123', '/welcome', '/share/abc']) {
      const res = await request(makeApp()).get(path)
      expect(res.status).toBe(200)
      expect(res.text).toContain('<div id="root">')
    }
  })

  it('caches hashed assets for a year and never caches index.html', async () => {
    const asset = await request(makeApp()).get('/assets/app-abc123.js')
    expect(asset.status).toBe(200)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const index = await request(makeApp()).get('/')
    expect(index.headers['cache-control']).toBe('no-cache')
    const fallback = await request(makeApp()).get('/some/route')
    expect(fallback.headers['cache-control']).toBe('no-cache')
  })

  it('serves other static files', async () => {
    expect((await request(makeApp()).get('/manifest.webmanifest')).status).toBe(200)
  })

  it('never answers /api: the API keeps its auth and its JSON errors', async () => {
    const app = makeApp()
    expect((await request(app).get('/api/ping')).status).toBe(401)
    const ok = await request(app).get('/api/ping').set('Authorization', 'Bearer x')
    expect(ok.body).toEqual({ pong: true })
    const unknown = await request(app).get('/api/does-not-exist')
    expect(unknown.status).toBe(401) // falls through to the API, not to index.html
    expect(unknown.text).not.toContain('<div id="root">')
    expect((await request(app).get('/api')).status).toBe(401)
  })

  it('answers only GET with the app: a POST to an unknown path is not turned into HTML', async () => {
    const res = await request(makeApp()).post('/settings/ai')
    expect(res.text).not.toContain('<div id="root">')
  })

  it('does not let a request escape the build directory', async () => {
    const res = await request(makeApp()).get('/..%2f..%2fetc/passwd')
    expect(res.text).not.toContain('root:')
  })
})

describe('clientDistDir', () => {
  it('uses MEMEX_CLIENT_DIR when it holds a built app', () => {
    expect(clientDistDir({ MEMEX_CLIENT_DIR: dir } as NodeJS.ProcessEnv)).toBe(dir)
  })
  it('ignores a directory without index.html', () => {
    const found = clientDistDir({ MEMEX_CLIENT_DIR: empty } as NodeJS.ProcessEnv)
    expect(found).not.toBe(empty)
  })
})

describe('shouldServeClient', () => {
  it.each([
    [{ NODE_ENV: 'production' }, true],
    [{ NODE_ENV: 'development' }, false],
    [{}, false],
    [{ MEMEX_SERVE_CLIENT: '1' }, true],
    [{ NODE_ENV: 'production', MEMEX_SERVE_CLIENT: '0' }, false],
  ])('%j -> %s', (e, expected) => {
    expect(shouldServeClient(e as NodeJS.ProcessEnv)).toBe(expected)
  })
})
