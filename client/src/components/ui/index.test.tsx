import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Badge, Button, EmptyState, LoadingState, SearchField, Tabs, TextField } from './index'

describe('shared UI foundation', () => {
  it('exposes busy and disabled states on buttons', () => {
    render(<Button loading>Saving</Button>)
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('associates field labels, hints and errors with the input', () => {
    render(<TextField label="Title" hint="Keep it short" error="Required" />)
    const input = screen.getByRole('textbox', { name: 'Title' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain('hint')
    expect(input.getAttribute('aria-describedby')).toContain('error')
  })

  it('uses search semantics and announces stateful content', () => {
    render(<><SearchField label="Search library" /><LoadingState label="Searching" /><EmptyState title="No matches" /></>)
    expect(screen.getByRole('searchbox', { name: 'Search library' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Searching')
    expect(screen.getByRole('heading', { name: 'No matches' })).toBeInTheDocument()
  })

  it('supports selected tabs and arrow-key movement', () => {
    const onChange = vi.fn()
    render(<Tabs label="Library views" value="notes" onChange={onChange} items={[{ value: 'notes', label: 'Notes' }, { value: 'links', label: 'Links' }]} />)
    const notes = screen.getByRole('tab', { name: 'Notes' })
    expect(notes).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(notes, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('links')
    expect(screen.getByRole('tab', { name: 'Links' })).toHaveFocus()
  })

  it('renders badges with their tone class', () => {
    render(<Badge tone="success">Saved</Badge>)
    expect(screen.getByText('Saved')).toHaveClass('text-green-400')
  })
})
