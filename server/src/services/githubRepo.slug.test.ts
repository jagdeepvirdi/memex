import { describe, it, expect } from 'vitest'
import { isValidRepoSlug, repoSlugFromStructured } from './githubRepo'

describe('isValidRepoSlug', () => {
  it.each(['anthropics/claude-code', 'a/b', 'Foo-Bar/baz.js', 'owner/repo_name', 'o/.github', 'owner/a.b-c_d'])('accepts %s', s => {
    expect(isValidRepoSlug(s)).toBe(true)
  })

  it.each([
    '', 'a', 'owner', 'a/b/c', 'owner/', '/repo', 'owner/re po', 'owner/repo?x=1', 'owner/repo#frag', '../x', 'a/..', 'a/.', '-bad/repo',
    'owner/repo.', 'a b/c', 'https://github.com/a/b', 'o'.repeat(40) + '/r',
  ])('rejects %j', s => {
    expect(isValidRepoSlug(s)).toBe(false)
  })
})

describe('repoSlugFromStructured', () => {
  it('prefers repoName, lower-cased, without .git', () => {
    expect(repoSlugFromStructured({ repoName: 'Anthropics/Claude-Code.git' })).toBe('anthropics/claude-code')
  })

  it('falls back to repoUrl when repoName is missing or not a repo', () => {
    expect(repoSlugFromStructured({ repoUrl: 'https://github.com/Foo/Bar/' })).toBe('foo/bar')
    expect(repoSlugFromStructured({ repoName: 'my cool project', repoUrl: 'https://github.com/a/b' })).toBe('a/b')
  })

  it('is undefined for junk, other hosts and non-strings', () => {
    expect(repoSlugFromStructured({})).toBeUndefined()
    expect(repoSlugFromStructured({ repoName: 'just words', repoUrl: 'https://example.com/a/b' })).toBeUndefined()
    expect(repoSlugFromStructured({ repoName: 42, repoUrl: { a: 1 } })).toBeUndefined()
    expect(repoSlugFromStructured({ repoName: '../../etc/passwd' })).toBeUndefined()
    expect(repoSlugFromStructured({ repoUrl: 'https://github.com/settings/profile' })).toBeUndefined()
  })
})
