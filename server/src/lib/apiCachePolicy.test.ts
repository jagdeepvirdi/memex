import { describe, expect, it } from 'vitest'
import express from 'express'
import request from 'supertest'
import { noStoreApiResponses } from './apiCachePolicy.js'

describe('noStoreApiResponses', () => {
  it('marks API responses private and non-cacheable', async () => {
    const app = express()
    app.use('/api', noStoreApiResponses)
    app.get('/api/items', (_req, res) => res.json({ items: [] }))

    const response = await request(app).get('/api/items')

    expect(response.headers['cache-control']).toBe('private, no-store')
  })
})
