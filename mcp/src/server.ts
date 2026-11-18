import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemexClient } from './client.js'
import { registerTools } from './tools.js'

export const VERSION = '1.0.0'

export const INSTRUCTIONS =
  "Memex is the user's personal knowledge base: notes, recipes, links, books, places and more. " +
  'Search it before saying you do not know something the user may have saved. Items the user marked private are never available here; ' +
  'if a search says some matches are private, mention that without asking for them. Only save notes or links when the user asks you to.'

/** The MCP server with its tools registered, not yet connected to any transport. */
export function createServer(client: MemexClient): McpServer {
  const server = new McpServer({ name: 'memex', version: VERSION }, { instructions: INSTRUCTIONS })
  registerTools(server, client)
  return server
}
