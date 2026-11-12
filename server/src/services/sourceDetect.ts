import type { ItemSource } from '../../../shared/types.js'
import { detectGithubRepoSubject } from './githubRepo.js'

export interface DetectedSource {
  source: ItemSource
  sourceUrl?: string
}

const INSTAGRAM_URL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reels?|tv)\/[^\s<>"')]+/i

/**
 * Works out where pasted text came from so the Manual tab no longer labels everything `manual`.
 * - an Instagram post/reel URL anywhere in the text  → source `instagram`, sourceUrl = that URL
 * - text whose subject is a single GitHub repo URL   → source `url`, sourceUrl = the repo URL
 * - anything else                                    → `manual`, no sourceUrl
 */
export function detectPasteSource(text: string): DetectedSource {
  const insta = text.match(INSTAGRAM_URL_RE)
  if (insta) return { source: 'instagram', sourceUrl: insta[0].replace(/[.,;:!?]+$/, '') }

  const repo = detectGithubRepoSubject(text)
  if (repo) return { source: 'url', sourceUrl: repo.url }

  return { source: 'manual' }
}
