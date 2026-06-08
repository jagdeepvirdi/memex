import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../components/sidebar/Sidebar', () => ({
  default: ({ activeSection }: any) => <div data-testid="mock-sidebar">Sidebar: {activeSection}</div>,
}))

vi.mock('../components/AppHeader', () => {
  const MockHeader = ({ left, actions }: any) => (
    <div data-testid="mock-app-header">
      <div data-testid="left-slot">{left}</div>
      <div data-testid="actions-slot">{actions}</div>
    </div>
  )
  MockHeader.Spacer = () => <div data-testid="mock-app-header-spacer" />
  return { AppHeader: MockHeader }
})

vi.mock('react-force-graph-2d', () => ({
  default: (props: any) => {
    // Explicitly call node canvas functions in mock to cover canvas drawing paths
    const mockCtx = {
      measureText: () => ({ width: 50 }),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    }
    props.graphData.nodes.forEach((node: any) => {
      if (props.nodeCanvasObject) {
        props.nodeCanvasObject(node, mockCtx, 1)
      }
      if (props.nodePointerAreaPaint) {
        props.nodePointerAreaPaint(node, 'red', mockCtx)
      }
    })
    return (
      <div data-testid="mock-force-graph">
        {props.graphData.nodes.map((node: any) => (
          <button
            key={node.id}
            data-testid={`node-${node.id}`}
            onClick={() => props.onNodeClick(node)}
            style={{ color: props.nodeColor ? props.nodeColor(node) : undefined }}
          >
            {node.title}
          </button>
        ))}
      </div>
    )
  }
}))

const mockApiFetch = vi.fn()
vi.mock('../lib/api', () => ({
  apiFetch: (url: string, init?: any) => mockApiFetch(url, init),
}))

import SemanticGraphPage from './SemanticGraph'

describe('SemanticGraphPage Component', () => {
  const mockGraphData = {
    nodes: [
      { id: 'item1', title: 'Recipe Node', type: 'recipe' },
      { id: 'item2', title: 'Media Node', type: 'media' },
      { id: 'item3', title: 'Book Node', type: 'book' },
      { id: 'item4', title: 'Finance Node', type: 'stock' },
      { id: 'item5', title: 'Spec Node', type: 'spec' },
      { id: 'item6', title: 'Link Node', type: 'link' },
      { id: 'item7', title: 'Default Node', type: 'note' },
    ],
    links: [
      { source: 'item1', target: 'item2', weight: 2 },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(mockGraphData)
  })

  it('renders loading indicator, then interactive map with clusters and legend', async () => {
    render(<SemanticGraphPage />)

    expect(screen.getByText('Mapping semantic clusters...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('mock-force-graph')).toBeInTheDocument()
    })

    // Verify clusters legend is displayed
    expect(screen.getByText('Recipes')).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()
    expect(screen.getByText('Books')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('Links')).toBeInTheDocument()

    // Verify sidebar active section
    expect(screen.getByTestId('mock-sidebar')).toHaveTextContent('Sidebar: dashboard')
  })

  it('handles clicking a node to navigate to the item detail page', async () => {
    render(<SemanticGraphPage />)

    await waitFor(() => {
      expect(screen.getByTestId('node-item1')).toBeInTheDocument()
    })

    // Click recipe node
    fireEvent.click(screen.getByTestId('node-item1'))
    expect(mockNavigate).toHaveBeenCalledWith('/item/item1')
  })

  it('supports exiting/entering fullscreen mode', async () => {
    render(<SemanticGraphPage />)

    await waitFor(() => {
      expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument()
    })

    const fullscreenBtn = screen.getByTitle('Fullscreen')
    fireEvent.click(fullscreenBtn)

    // Fullscreen active should hide Sidebar
    expect(screen.queryByTestId('mock-sidebar')).not.toBeInTheDocument()

    // Click again to exit
    const exitFullscreenBtn = screen.getByTitle('Exit Fullscreen')
    fireEvent.click(exitFullscreenBtn)

    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument()
  })

  it('handles manual refreshing of the semantic graph data', async () => {
    render(<SemanticGraphPage />)

    await waitFor(() => {
      expect(screen.getByText('Refresh Map')).toBeInTheDocument()
    })

    const refreshBtn = screen.getByText('Refresh Map')
    fireEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2) // mount + click
    })
  })

  it('displays empty state when there are no nodes in the map', async () => {
    mockApiFetch.mockResolvedValue({ nodes: [], links: [] })

    render(<SemanticGraphPage />)

    await waitFor(() => {
      expect(screen.getByText('The map is dark')).toBeInTheDocument()
      expect(screen.getByText(/Add more items with AI classification/i)).toBeInTheDocument()
    })
  })
})
