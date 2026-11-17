import { Router } from 'express'
import { pool } from '../db/client.js'
import logger from '../lib/logger.js'
import { clearDemoData, demoCount, DemoAlreadyLoadedError, loadDemoData } from '../services/demoData.js'

const router = Router()

// GET /api/demo: how many sample items are loaded (0: none), so the app can show the "Demo mode" banner.
router.get('/', async (_req, res) => {
  try {
    res.json({ items: await demoCount(pool) })
  } catch (err) {
    logger.error(err, 'GET /api/demo error')
    res.status(500).json({ error: 'Could not read the sample data state' })
  }
})

// POST /api/demo: load the sample items (one transaction, no AI call). 409 when they are already loaded.
router.post('/', async (_req, res) => {
  const client = await pool.connect()
  try {
    const items = await loadDemoData(client)
    res.status(201).json({ items })
  } catch (err) {
    if (err instanceof DemoAlreadyLoadedError) {
      res.status(409).json({ error: err.message })
      return
    }
    logger.error(err, 'POST /api/demo error')
    res.status(500).json({ error: 'Could not load the sample data' })
  } finally {
    client.release()
  }
})

// DELETE /api/demo: remove exactly the sample items, and what only they used. Your own notes are never touched.
router.delete('/', async (_req, res) => {
  const client = await pool.connect()
  try {
    res.json(await clearDemoData(client))
  } catch (err) {
    logger.error(err, 'DELETE /api/demo error')
    res.status(500).json({ error: 'Could not clear the sample data' })
  } finally {
    client.release()
  }
})

export default router
