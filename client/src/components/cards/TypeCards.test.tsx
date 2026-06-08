import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MediaCard from './MediaCard'
import RecipeCard from './RecipeCard'
import SpecCard from './SpecCard'
import StockCard from './StockCard'
import BookCard from './BookCard'
import LinkCard from './LinkCard'

const base = {
  id: 'test-1',
  content: 'Some content',
  source: 'manual' as const,
  reviewed: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  categories: ['Cat'],
  tags: ['tag1', 'tag2'],
}

// ── MediaCard ─────────────────────────────────────────────────────────────────

describe('MediaCard', () => {
  const item = {
    ...base,
    title: 'Inception',
    type: 'media' as const,
    structured: { genre: 'Sci-Fi', director: 'Nolan', year: 2010, watched: true },
  }

  it('renders the title', () => {
    render(<MediaCard item={item} />)
    expect(screen.getByText('Inception')).toBeInTheDocument()
  })

  it('renders the Movie type badge', () => {
    render(<MediaCard item={item} />)
    expect(screen.getByText('Movie')).toBeInTheDocument()
  })

  it('renders the genre badge', () => {
    render(<MediaCard item={item} />)
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument()
  })

  it('renders the director', () => {
    render(<MediaCard item={item} />)
    expect(screen.getByText(/Nolan/)).toBeInTheDocument()
  })

  it('renders the year', () => {
    render(<MediaCard item={item} />)
    expect(screen.getByText('2010')).toBeInTheDocument()
  })

  it('shows Watched status when watched=true', () => {
    render(<MediaCard item={item} />)
    expect(screen.getByText('Watched')).toBeInTheDocument()
  })

  it('shows Want to watch when watched=false', () => {
    const unwatched = { ...item, structured: { ...item.structured, watched: false } }
    render(<MediaCard item={unwatched} />)
    expect(screen.getByText('Want to watch')).toBeInTheDocument()
  })

  it('renders tags', () => {
    render(<MediaCard item={item} />)
    expect(screen.getByText('tag1')).toBeInTheDocument()
    expect(screen.getByText('tag2')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<MediaCard item={item} onClick={onClick} />)
    fireEvent.click(screen.getByText('Inception'))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders without optional fields gracefully', () => {
    const minimal = { ...item, structured: {} }
    render(<MediaCard item={minimal} />)
    expect(screen.getByText('Inception')).toBeInTheDocument()
  })
})

// ── RecipeCard ────────────────────────────────────────────────────────────────

describe('RecipeCard', () => {
  const item = {
    ...base,
    title: 'Chicken Tikka Masala',
    type: 'recipe' as const,
    structured: {
      mealType: 'Dinner',
      cuisine: 'Indian',
      cookTime: '45 min',
      servings: '4',
      prepTime: '15 min',
      ingredients: ['chicken', 'tomatoes', 'cream', 'garlic', 'ginger'],
      steps: ['Marinate', 'Grill', 'Simmer sauce'],
    },
  }

  it('renders the title', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText('Chicken Tikka Masala')).toBeInTheDocument()
  })

  it('renders the meal type badge', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText('Dinner')).toBeInTheDocument()
  })

  it('renders cuisine badge', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText('Indian')).toBeInTheDocument()
  })

  it('renders cook time', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText(/45 min/)).toBeInTheDocument()
  })

  it('renders serving count', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText(/👤/)).toBeInTheDocument()
  })

  it('renders first 3 ingredients with +N more', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText(/chicken.*tomatoes.*cream.*\+2 more/)).toBeInTheDocument()
  })

  it('renders step count', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText('3 steps')).toBeInTheDocument()
  })

  it('renders prep time', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText(/Prep 15 min/)).toBeInTheDocument()
  })

  it('falls back to Recipe label when mealType is absent', () => {
    const noMeal = { ...item, structured: { ...item.structured, mealType: undefined } }
    render(<RecipeCard item={noMeal} />)
    expect(screen.getByText('Recipe')).toBeInTheDocument()
  })

  it('renders tags', () => {
    render(<RecipeCard item={item} />)
    expect(screen.getByText('tag1')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<RecipeCard item={item} onClick={onClick} />)
    fireEvent.click(screen.getByText('Chicken Tikka Masala'))
    expect(onClick).toHaveBeenCalled()
  })
})

// ── SpecCard ──────────────────────────────────────────────────────────────────

describe('SpecCard', () => {
  const item = {
    ...base,
    title: 'MacBook Pro 16"',
    type: 'spec' as const,
    structured: { cpu: 'M3 Pro', ram: '18 GB', storage: '512 GB', display: '16 inch' },
  }

  it('renders the title', () => {
    render(<SpecCard item={item} />)
    expect(screen.getByText('MacBook Pro 16"')).toBeInTheDocument()
  })

  it('renders the Spec type badge', () => {
    render(<SpecCard item={item} />)
    expect(screen.getByText('Spec')).toBeInTheDocument()
  })

  it('renders up to 4 key-value pairs', () => {
    render(<SpecCard item={item} />)
    expect(screen.getByText('cpu')).toBeInTheDocument()
    expect(screen.getByText('M3 Pro')).toBeInTheDocument()
    expect(screen.getByText('ram')).toBeInTheDocument()
    expect(screen.getByText('18 GB')).toBeInTheDocument()
  })

  it('shows "+N more fields" when structured has more than 4 keys', () => {
    const many = {
      ...item,
      structured: { cpu: 'x', ram: 'x', storage: 'x', display: 'x', weight: 'x', color: 'x' },
    }
    render(<SpecCard item={many} />)
    expect(screen.getByText('+2 more fields')).toBeInTheDocument()
  })

  it('falls back to content snippet when structured is empty', () => {
    const empty = { ...item, structured: {}, content: 'Just a plain spec note for testing' }
    render(<SpecCard item={empty} />)
    expect(screen.getByText(/Just a plain spec note/)).toBeInTheDocument()
  })

  it('renders tags', () => {
    render(<SpecCard item={item} />)
    expect(screen.getByText('tag1')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<SpecCard item={item} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
})

// ── StockCard ─────────────────────────────────────────────────────────────────

describe('StockCard', () => {
  const item = {
    ...base,
    title: 'Apple Inc.',
    type: 'stock' as const,
    content: 'Long-term hold. Strong ecosystem and services revenue.',
    structured: { ticker: 'AAPL', exchange: 'NASDAQ' },
  }

  it('renders the title', () => {
    render(<StockCard item={item} />)
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
  })

  it('renders the Stock type badge', () => {
    render(<StockCard item={item} />)
    expect(screen.getByText('Stock')).toBeInTheDocument()
  })

  it('renders the ticker in uppercase', () => {
    render(<StockCard item={item} />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
  })

  it('renders the exchange name', () => {
    render(<StockCard item={item} />)
    expect(screen.getByText('NASDAQ')).toBeInTheDocument()
  })

  it('renders the notes/content preview', () => {
    render(<StockCard item={item} />)
    expect(screen.getByText(/Long-term hold/)).toBeInTheDocument()
  })

  it('normalises numeric ticker to uppercase string', () => {
    const numericTicker = { ...item, structured: { ticker: 'tsla', exchange: 'NASDAQ' } }
    render(<StockCard item={numericTicker} />)
    expect(screen.getByText('TSLA')).toBeInTheDocument()
  })

  it('hides title when it matches the ticker', () => {
    const sameTitle = { ...item, title: 'AAPL' }
    render(<StockCard item={sameTitle} />)
    // Title should not be rendered separately from the ticker span
    const all = screen.getAllByText('AAPL')
    // Only one instance — from the ticker span, not a second CardTitle
    expect(all).toHaveLength(1)
  })

  it('renders tags', () => {
    render(<StockCard item={item} />)
    expect(screen.getByText('tag1')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<StockCard item={item} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders without optional structured fields', () => {
    const noData = { ...item, structured: {} }
    render(<StockCard item={noData} />)
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
  })
})

// ── BookCard ──────────────────────────────────────────────────────────────────

describe('BookCard', () => {
  const item = {
    ...base,
    title: 'The Pragmatic Programmer',
    type: 'book' as const,
    structured: {
      author: 'Andrew Hunt',
      genre: 'Technical',
      year: 1999,
      status: 'read' as const,
    },
  }

  it('renders the title', () => {
    render(<BookCard item={item} />)
    expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument()
  })

  it('renders the Book type badge', () => {
    render(<BookCard item={item} />)
    expect(screen.getByText('Book')).toBeInTheDocument()
  })

  it('renders the author', () => {
    render(<BookCard item={item} />)
    expect(screen.getByText(/Andrew Hunt/)).toBeInTheDocument()
  })

  it('renders the genre badge', () => {
    render(<BookCard item={item} />)
    expect(screen.getByText('Technical')).toBeInTheDocument()
  })

  it('renders the year', () => {
    render(<BookCard item={item} />)
    expect(screen.getByText('1999')).toBeInTheDocument()
  })

  it('shows Read ✓ status for read books', () => {
    render(<BookCard item={item} />)
    expect(screen.getByText('Read ✓')).toBeInTheDocument()
  })

  it('shows Want to read status for unset books', () => {
    const unread = { ...item, structured: { ...item.structured, status: undefined } }
    render(<BookCard item={unread} />)
    expect(screen.getByText('Want to read')).toBeInTheDocument()
  })

  it('shows Reading status for books in progress', () => {
    const reading = { ...item, structured: { ...item.structured, status: 'reading' as const } }
    render(<BookCard item={reading} />)
    expect(screen.getByText('Reading')).toBeInTheDocument()
  })

  it('renders tags', () => {
    render(<BookCard item={item} />)
    expect(screen.getByText('tag1')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<BookCard item={item} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
})

// ── LinkCard ──────────────────────────────────────────────────────────────────

describe('LinkCard', () => {
  const item = {
    ...base,
    title: 'Understanding TypeScript',
    type: 'link' as const,
    source: 'url' as const,
    content: 'A comprehensive guide to TypeScript features.',
    structured: { summary: 'Deep dive into TypeScript type system and best practices.' },
    sourceUrl: 'https://www.typescriptlang.org/docs/',
  }

  it('renders the title', () => {
    render(<LinkCard item={item} />)
    expect(screen.getByText('Understanding TypeScript')).toBeInTheDocument()
  })

  it('renders the Link type badge with source label', () => {
    render(<LinkCard item={item} />)
    expect(screen.getByText('Web')).toBeInTheDocument()
  })

  it('renders the hostname from sourceUrl', () => {
    render(<LinkCard item={item} />)
    expect(screen.getByText('typescriptlang.org')).toBeInTheDocument()
  })

  it('renders the summary preview', () => {
    render(<LinkCard item={item} />)
    expect(screen.getByText(/Deep dive into TypeScript/)).toBeInTheDocument()
  })

  it('renders the source URL as a link', () => {
    render(<LinkCard item={item} />)
    const link = screen.getByRole('link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://www.typescriptlang.org/docs/')
  })

  it('renders YouTube source label for youtube source', () => {
    const yt = { ...item, source: 'youtube' as const }
    render(<LinkCard item={yt} />)
    expect(screen.getByText('YouTube')).toBeInTheDocument()
  })

  it('falls back to content when no summary in structured', () => {
    const noSummary = { ...item, structured: {} }
    render(<LinkCard item={noSummary} />)
    expect(screen.getByText(/A comprehensive guide/)).toBeInTheDocument()
  })

  it('renders tags', () => {
    render(<LinkCard item={item} />)
    expect(screen.getByText('tag1')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<LinkCard item={item} onClick={onClick} />)
    fireEvent.click(screen.getByText('Understanding TypeScript'))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders without sourceUrl gracefully', () => {
    const noUrl = { ...item, sourceUrl: undefined }
    render(<LinkCard item={noUrl} />)
    expect(screen.getByText('Understanding TypeScript')).toBeInTheDocument()
  })
})
