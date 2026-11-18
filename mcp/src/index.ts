#!/usr/bin/env node
// Memex MCP server. An MCP host (Claude Desktop, Cursor, ...) launches this program and talks to it over stdio.
//
// stdout is the protocol channel: NOTHING else may be written to it. Messages for the person go to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ConfigError, readConfig } from './config.js'
import { MemexClient } from './client.js'
import { createServer, VERSION } from './server.js'

async function main(): Promise<void> {
  let config
  try {
    config = readConfig()
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`memex-mcp: ${err.message}`)
      process.exit(1)
    }
    throw err
  }
  if (config.warning) console.error(`memex-mcp: warning: ${config.warning}`)

  const server = createServer(new MemexClient(config.baseUrl, config.key))
  await server.connect(new StdioServerTransport())
  console.error(`memex-mcp ${VERSION} ready (talking to ${config.baseUrl})`)
}

main().catch(err => {
  console.error('memex-mcp: failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
