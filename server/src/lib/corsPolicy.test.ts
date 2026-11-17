import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import cors from 'cors'
import { corsDelegate, isOriginAllowed, parseAllowedOrigins } from './corsPolicy'

describe('parseAllowedOrigins', () => {
  it('splits, trims, drops trailing slashes and junk', () => {
    expect(parseAllowedOrigins(' https://a.example.com/ , http://b.test:8080,,not-a-url, ftp://x.com, https://c.com/path')).toEqual([
      'https://a.example.com', 'http://b.test:8080',
    ])
  })
  it.each([undefined, '', '  '])('gives nothing for %j', (v) => expect(parseAllowedOrigins(v)).toEqual([]))
})

describe('isOriginAllowed', () => {
  it.each(['http://localhost:5175', 'http://localhost', 'https://127.0.0.1:3002', 'http://[::1]:8080', 'HTTP://LOCALHOST:1'])('allows local %s', (o) => {
    expect(isOriginAllowed(o, [])).toBe(true)
  })
  it.each(['https://evil.example', 'http://localhost.evil.example', 'http://evil.example/localhost', 'http://127.0.0.1.evil.example', 'http://localhost:99999999'])('refuses %s', (o) => {
    expect(isOriginAllowed(o, [])).toBe(false)
  })
  it('allows a listed origin, case-insensitively, and nothing near it', () => {
    expect(isOriginAllowed('https://Memex.Example.com', ['https://memex.example.com'])).toBe(true)
    expect(isOriginAllowed('http://memex.example.com', ['https://memex.example.com'])).toBe(false)
    expect(isOriginAllowed('https://memex.example.com.evil.io', ['https://memex.example.com'])).toBe(false)
  })
})

describe('the policy on a real express app', () => {
  const app = express()
  app.use(cors(corsDelegate(['https://memex.example.com'], ['x-refreshed-token'])))
  app.all('*', (_req, res) => res.json({ ok: true }))
  const acao = (r: request.Response) => r.headers['access-control-allow-origin']

  it('answers a page on any site for the bookmarklet route, including its preflight', async () => {
    const pre = await request(app).options('/api/ingest/quicksave')
      .set('Origin', 'https://some-random-site.example').set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
    expect(acao(pre)).toBe('https://some-random-site.example')
    const post = await request(app).post('/api/ingest/quicksave').set('Origin', 'https://some-random-site.example')
    expect(acao(post)).toBe('https://some-random-site.example')
  })

  it('does not open other routes to a random site, with or without a preflight', async () => {
    for (const path of ['/api/items', '/api/vault/status', '/api/settings', '/api/ingest/text']) {
      const get = await request(app).get(path).set('Origin', 'https://evil.example')
      expect(acao(get)).toBeUndefined()
      const pre = await request(app).options(path).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET')
      expect(acao(pre)).toBeUndefined()
    }
  })

  it('does not open other methods on the quicksave path to a random site', async () => {
    const get = await request(app).get('/api/ingest/quicksave').set('Origin', 'https://evil.example')
    expect(acao(get)).toBeUndefined()
    const pre = await request(app).options('/api/ingest/quicksave').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'DELETE')
    expect(acao(pre)).toBeUndefined()
  })

  it('still serves local tools and listed origins on every route', async () => {
    expect(acao(await request(app).get('/api/items').set('Origin', 'http://localhost:5175'))).toBe('http://localhost:5175')
    expect(acao(await request(app).get('/api/items').set('Origin', 'https://memex.example.com'))).toBe('https://memex.example.com')
  })

  it('leaves requests with no Origin header alone (curl, same-origin)', async () => {
    const res = await request(app).get('/api/items')
    expect(res.status).toBe(200)
    expect(acao(res)).toBeUndefined()
  })

  it('keeps exposing the refreshed-token header to allowed origins', async () => {
    const res = await request(app).get('/api/items').set('Origin', 'http://localhost:5175')
    expect(res.headers['access-control-expose-headers']).toContain('x-refreshed-token')
  })
})
