import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
  })

  it('cycles system -> light -> dark -> system and updates the page theme', () => {
    render(<ThemeToggle />)
    const btn = () => screen.getByRole('button')
    expect(btn().getAttribute('aria-label')).toMatch(/follow system/i)
    fireEvent.click(btn())
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(btn().getAttribute('aria-label')).toMatch(/Theme: light/)
    fireEvent.click(btn())
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(btn().getAttribute('aria-label')).toMatch(/Theme: dark/)
    fireEvent.click(btn())
    expect(btn().getAttribute('aria-label')).toMatch(/follow system/i)
    expect(localStorage.getItem('memex-theme')).toBeNull()
  })
})
