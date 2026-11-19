import type { RequestHandler } from 'express'

/** API responses can contain private library data; browsers and intermediaries must not persist them. */
export const noStoreApiResponses: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store')
  next()
}
