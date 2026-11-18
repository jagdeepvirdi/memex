import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../../lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import { McpPanel, buildMcpConfig } from './McpPanel'

const KEY = 'mxk_' + 'e'.repeat(48)

beforeEach(() => {
  apiFetch.mockReset()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('buildMcpConfig', () => {
  it('makes a config block with the key and address, and a path placeholder the user must replace', () => {
    const cfg = JSON.parse(buildMcpConfig(KEY, 'http://localhost:3002'))
    expect(cfg.mcpServers.memex.command).toBe('node')
    expect(cfg.mcpServers.memex.args[0]).toMatch(/mcp\/dist\/index\.js$/)
    expect(cfg.mcpServers.memex.args[0]).toContain('<path to your memex folder>')
    expect(cfg.mcpServers.memex.env).toEqual({ MEMEX_URL: 'http://localhost:3002', MEMEX_MCP_KEY: KEY })
  })
})

describe('McpPanel', () => {
  it('explains what an assistant can and cannot do', () => {
    render(<McpPanel initiallySet={false} />)
    expect(screen.getByText(/search, read and save/i)).toBeInTheDocument()
    expect(screen.getByText(/Private items stay private/)).toBeInTheDocument()
    expect(screen.getByText(/Strict Local Mode switches this off/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create key/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Revoke key/ })).not.toBeInTheDocument()
  })

  it('creates a key, shows it once with a ready-to-paste config, and then offers Replace and Revoke', async () => {
    apiFetch.mockResolvedValueOnce({ key: KEY })
    render(<McpPanel initiallySet={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Create key/ }))

    await waitFor(() => expect(screen.getByTestId('mcp-key')).toHaveTextContent(KEY))
    expect(apiFetch).toHaveBeenCalledWith('/settings/mcp-key', { method: 'POST' })
    expect(screen.getByTestId('mcp-config').textContent).toContain(KEY)
    expect(screen.getByTestId('mcp-config').textContent).toContain('MEMEX_URL')
    expect(screen.getByRole('button', { name: /Replace key/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revoke key/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Copy key/ }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(KEY)
  })

  it('does not show an existing key (only its hash is stored): it says one is active and offers Replace / Revoke', () => {
    render(<McpPanel initiallySet />)
    expect(screen.queryByTestId('mcp-key')).not.toBeInTheDocument()
    expect(screen.getByText(/A key is active/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be shown again/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Replace key/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revoke key/ })).toBeInTheDocument()
  })

  it('revoking removes the key and goes back to Create', async () => {
    apiFetch.mockResolvedValueOnce({ status: 'ok' })
    render(<McpPanel initiallySet />)
    fireEvent.click(screen.getByRole('button', { name: /Revoke key/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Create key/ })).toBeInTheDocument())
    expect(apiFetch).toHaveBeenCalledWith('/settings/mcp-key', { method: 'DELETE' })
    expect(screen.queryByRole('button', { name: /Revoke key/ })).not.toBeInTheDocument()
  })

  it('shows a readable error when the server cannot be reached, and does not pretend a key exists', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network'))
    render(<McpPanel initiallySet={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Create key/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Could not create a key/))
    expect(screen.queryByTestId('mcp-key')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create key/ })).toBeInTheDocument()
  })
})
