import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classify, refineCategories, type ClassificationResult } from './classifier'

vi.mock('./ai', () => ({ aiChat: vi.fn() }))
vi.mock('./githubApi', () => ({ lookupGithubRepo: vi.fn().mockResolvedValue(null) }))
vi.mock('./settings', () => ({ getAiConfig: vi.fn().mockResolvedValue({ model: 'test-model' }) }))

import { aiChat } from './ai'

beforeEach(() => vi.mocked(aiChat).mockReset())

const result = (over: Partial<ClassificationResult>): ClassificationResult => ({
  type: 'link', title: 'x', categories: [], tags: [], summary: '', structured: {}, confidence: 90, ...over,
})

describe('refineCategories: Tech > AI is only for AI', () => {
  it('moves a general programming course out of Explainers into Tech', () => {
    const r = refineCategories(result({ title: 'Complete MySQL Beginner to Expert', summary: 'A full SQL course.', categories: ['Tech', 'AI', 'Explainers'], structured: { kind: 'explainer' } }))
    expect(r.categories).toEqual(['Tech'])
  })

  it('moves a non-AI app out of Tools into Tech', () => {
    expect(refineCategories(result({ title: 'Photoshop', summary: 'Image editor.', categories: ['Tech', 'AI', 'Tools'] })).categories).toEqual(['Tech'])
    expect(refineCategories(result({ title: 'VSCode', summary: 'A code editor.', categories: ['Tech', 'AI', 'Tools'] })).categories).toEqual(['Tech'])
  })

  it('keeps genuine AI explainers and tools', () => {
    expect(refineCategories(result({ title: 'Claude Fundamentals In 20 Minutes', categories: ['Tech', 'AI', 'Explainers'] })).categories).toEqual(['Tech', 'AI', 'Explainers'])
    expect(refineCategories(result({ title: 'Top AI Tools for Designers', categories: ['Tech', 'AI', 'Tools'] })).categories).toEqual(['Tech', 'AI', 'Tools'])
    expect(refineCategories(result({ title: 'x', summary: 'A prompt library for LLM agents.', categories: ['Tech', 'AI', 'Tools'] })).categories).toEqual(['Tech', 'AI', 'Tools'])
  })

  it('also looks at the start of the original text, not only what the model said', () => {
    const r = result({ title: 'x', summary: 'x', categories: ['Tech', 'AI', 'Explainers'] })
    expect(refineCategories(r, 'Title: How MCP works').categories).toEqual(['Tech', 'AI', 'Explainers'])
    expect(refineCategories(r, 'Title: Learn Flask').categories).toEqual(['Tech'])
  })

  it('does not match AI inside another word (e.g. "Maths", "Dash", "again")', () => {
    expect(refineCategories(result({ title: 'Maths Class', summary: 'Dash again', categories: ['Tech', 'AI', 'Tools'] })).categories).toEqual(['Tech'])
  })

  it('never touches Repos or Prompts & Skills', () => {
    expect(refineCategories(result({ title: 'zip helper', categories: ['Tech', 'AI', 'Repos'], structured: { kind: 'repo' } })).categories).toEqual(['Tech', 'AI', 'Repos'])
    expect(refineCategories(result({ title: 'A Skills Fest', categories: ['Tech', 'AI', 'Prompts & Skills'] })).categories).toEqual(['Tech', 'AI', 'Prompts & Skills'])
  })
})

describe('refineCategories: Finance > Notes is only for finance', () => {
  it('sends a shop or property link without finance words back to Links', () => {
    expect(refineCategories(result({ title: 'Comfortable Summer Sandals', summary: 'An online shop.', categories: ['Finance', 'Notes'] })).categories).toEqual(['Links'])
    expect(refineCategories(result({ title: 'Sell 2-story townhouse, Example Road', summary: 'A property listing.', categories: ['Finance', 'Notes'] })).categories).toEqual(['Links'])
  })

  it('keeps Finance > Notes when the model talks about finance', () => {
    expect(refineCategories(result({ title: 'Savings account rates', summary: 'Bank interest rates.', categories: ['Finance', 'Notes'] })).categories).toEqual(['Finance', 'Notes'])
  })

  it('leaves a real note alone', () => {
    expect(refineCategories(result({ type: 'note', title: 'n', categories: ['Finance', 'Notes'] })).categories).toEqual(['Finance', 'Notes'])
  })
})

describe('refineCategories: Personal is not for shops', () => {
  it('sends a product or shop link out of Personal back to Links', () => {
    expect(refineCategories(result({ title: 'Comfortable Desk Lamp', summary: 'An online shop.', categories: ['Personal'] })).categories).toEqual(['Links'])
    expect(refineCategories(result({ title: 'Garden Chair', categories: ['Personal', 'Numbers'] })).categories).toEqual(['Links'])
  })

  it('keeps contacts and profile links in Personal', () => {
    expect(refineCategories(result({ title: 'Jane Doe', categories: ['Personal', 'Contacts'] })).categories).toEqual(['Personal', 'Contacts'])
    expect(refineCategories(result({ title: 'Jane Doe (Facebook)', categories: ['Personal'] })).categories).toEqual(['Personal'])
    expect(refineCategories(result({ title: 'x', categories: ['Personal'] }), 'Title: Jane Doe | LinkedIn').categories).toEqual(['Personal'])
  })

  it('leaves real personal notes alone', () => {
    expect(refineCategories(result({ type: 'note', title: 'Garage code', categories: ['Personal', 'Numbers'] })).categories).toEqual(['Personal', 'Numbers'])
  })
})

describe('refineCategories: Books are only for books', () => {
  it('moves an online course out of Books > Technical into Tech', () => {
    expect(refineCategories(result({ title: 'Data Visualization Specialization', categories: ['Media', 'Books', 'Technical'] })).categories).toEqual(['Tech'])
  })

  it('files another non-book under the type default instead of Books', () => {
    expect(refineCategories(result({ title: 'Some page', categories: ['Media', 'Books', 'Fiction'] })).categories).toEqual(['Links'])
  })

  it('keeps real books', () => {
    expect(refineCategories(result({ type: 'book', title: 'Clean Code', categories: ['Media', 'Books', 'Technical'] })).categories).toEqual(['Media', 'Books', 'Technical'])
  })
})

describe('refineCategories: everything else is untouched', () => {
  it('returns the same object for ordinary results', () => {
    const r = result({ title: 'Best lenses for Sony ZV-E10', categories: ['Tech', 'Cameras'] })
    expect(refineCategories(r)).toBe(r)
  })
})

describe('classify(): the guard runs after the dev-knowledge mapping', () => {
  it('a programming course the model tagged kind=explainer ends up in Tech, not Tech > AI', async () => {
    vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify({
      type: 'link', title: 'CSS Framework - Full Course for Beginners', categories: ['Tech', 'AI', 'Explainers'],
      tags: ['css'], summary: 'A beginner course on Bootstrap.', structured: { kind: 'explainer' },
    }))
    const r = await classify('https://example.com/bootstrap-course')
    expect(r.categories).toEqual(['Tech'])
  })

  it('an AI explainer keeps Tech > AI > Explainers', async () => {
    vi.mocked(aiChat).mockResolvedValueOnce(JSON.stringify({
      type: 'link', title: 'How Claude Code agents work', categories: ['Tech', 'AI', 'Explainers'],
      tags: ['ai'], summary: 'Explains agentic coding.', structured: { kind: 'explainer' },
    }))
    const r = await classify('https://example.com/claude-agents')
    expect(r.categories).toEqual(['Tech', 'AI', 'Explainers'])
  })
})
