import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  fetchVisionHealth: vi.fn().mockResolvedValue({ available: false, model: null }),
  uploadFile: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import FileIngestPanel from './FileIngestPanel'
import { apiFetch } from '../../lib/api'

beforeEach(() => vi.clearAllMocks())

describe('FileIngestPanel when MarkItDown is missing', () => {
  it('shows the pip instructions on a normal install', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ installed: false, inDocker: false })
    render(<FileIngestPanel onSuccess={vi.fn()} />)
    expect(await screen.findByText("pip install 'markitdown[all]'")).toBeInTheDocument()
    expect(screen.queryByTestId('docker-tool-notice')).not.toBeInTheDocument()
  })

  it('explains that the Docker image does not include it instead of an install command that cannot work', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ installed: false, inDocker: true })
    render(<FileIngestPanel onSuccess={vi.fn()} />)
    expect(await screen.findByTestId('docker-tool-notice')).toHaveTextContent(/Docker install does not include document conversion/i)
    expect(screen.queryByText("pip install 'markitdown[all]'")).not.toBeInTheDocument()
  })
})
