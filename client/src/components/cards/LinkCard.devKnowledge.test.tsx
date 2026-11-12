import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LinkCard from './LinkCard'
import type { Item } from '@shared/types'

const base: Item = {
  id: 'l1',
  title: 'claude-code',
  type: 'link',
  content: 'https://github.com/anthropics/claude-code',
  structured: {},
  source: 'instagram',
  sourceUrl: 'https://www.instagram.com/p/Cabc123/',
  reviewed: false,
  createdAt: new Date('2026-11-01'),
  updatedAt: new Date('2026-11-01'),
  categories: ['Tech', 'AI', 'Repos'],
  tags: [],
} as Item

describe('LinkCard — developer knowledge', () => {
  const repo: Item = {
    ...base,
    structured: {
      kind: 'repo', repoName: 'anthropics/claude-code', whatItDoes: 'A terminal coding agent.', summary: 'ignored',
    },
  }

  it('labels the card by what it is, not where it was posted', () => {
    render(<LinkCard item={repo} />)
    expect(screen.getByText('Repo')).toBeInTheDocument()
    expect(screen.queryByText('Instagram')).not.toBeInTheDocument()
  })

  it('shows owner/repo and the plain-English "what it does"', () => {
    render(<LinkCard item={repo} />)
    expect(screen.getByText('anthropics/claude-code')).toBeInTheDocument()
    expect(screen.getByText(/A terminal coding agent\./)).toBeInTheDocument()
    expect(screen.queryByText('ignored')).not.toBeInTheDocument()
  })

  it('labels prompts and skills without an owner/repo line', () => {
    render(<LinkCard item={{ ...base, structured: { kind: 'prompt', whatItDoes: 'Reviews code.' } }} />)
    expect(screen.getByText('Prompt')).toBeInTheDocument()
    expect(screen.queryByText(/\//, { selector: 'span.font-mono' })).not.toBeInTheDocument()
  })

  it('shows the priority badge only once the item is triaged', () => {
    const { rerender } = render(<LinkCard item={repo} />)
    expect(screen.queryByTestId('priority-badge')).not.toBeInTheDocument()
    rerender(<LinkCard item={{ ...repo, priority: 'essential' }} />)
    expect(screen.getByTestId('priority-badge')).toHaveTextContent('Essential')
  })

  it('leaves ordinary links unchanged', () => {
    render(<LinkCard item={{ ...base, source: 'url', sourceUrl: 'https://example.com/post', structured: { summary: 'An article.' } }} />)
    expect(screen.getByText('Web')).toBeInTheDocument()
    expect(screen.getByText('An article.')).toBeInTheDocument()
  })

  it('ignores an unknown structured.kind', () => {
    render(<LinkCard item={{ ...base, source: 'url', structured: { kind: 'bogus' } }} />)
    expect(screen.getByText('Web')).toBeInTheDocument()
  })
})
