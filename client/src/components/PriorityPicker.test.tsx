import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PriorityPicker, { PriorityBadge } from './PriorityPicker'

describe('PriorityPicker', () => {
  it('shows all three options and marks the selected one', () => {
    render(<PriorityPicker value="useful" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Essential' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Useful' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects an option on click', () => {
    const onChange = vi.fn()
    render(<PriorityPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Essential' }))
    expect(onChange).toHaveBeenCalledWith('essential')
  })

  it('clears the priority when the active option is clicked again', () => {
    const onChange = vi.fn()
    render(<PriorityPicker value="skip" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('ignores clicks while disabled', () => {
    const onChange = vi.fn()
    render(<PriorityPicker value={null} onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Useful' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('PriorityBadge', () => {
  it('renders the label for a triaged item', () => {
    render(<PriorityBadge value="essential" />)
    expect(screen.getByTestId('priority-badge')).toHaveTextContent('Essential')
  })

  it('renders nothing when untriaged', () => {
    const { container } = render(<PriorityBadge value={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
