// ── Core item types ───────────────────────────────────────────────────────────

export type ItemType =
  | 'note'
  | 'recipe'
  | 'media'
  | 'spec'
  | 'stock'
  | 'password'
  | 'link'
  | 'book'

export type ItemSource = 'keep' | 'manual' | 'url' | 'youtube' | 'instagram'

export interface Item {
  id: string
  title: string
  type: ItemType
  content: string
  structured: StructuredData
  categories: string[]     // e.g. ['Food', 'Bakery', 'Cakes']
  tags: string[]
  source: ItemSource
  sourceUrl?: string
  embedding?: number[]     // nomic-embed-text vector, stored in pgvector
  createdAt: Date
  updatedAt: Date
  encrypted?: boolean
  reviewed: boolean
}

// ── Structured data per type ──────────────────────────────────────────────────

export type StructuredData =
  | RecipeData
  | MediaData
  | BookData
  | StockData
  | SpecData
  | Record<string, unknown>  // note, link, password — freeform

export interface RecipeData {
  ingredients: string[]
  steps: string[]
  servings?: string
  prepTime?: string
  cookTime?: string
  cuisine?: string
  mealType?: string
}

export interface MediaData {
  genre?: string
  year?: number
  director?: string
  rating?: number
  watched?: boolean
}

export interface BookData {
  author?: string
  genre?: string
  year?: number
  status?: 'want-to-read' | 'reading' | 'read'
}

export interface StockData {
  ticker: string
  exchange?: string
}

export interface SpecData {
  [key: string]: string | number | boolean
}

// ── Category tree ─────────────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  parentId: string | null
  itemCount?: number
  children?: Category[]
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export interface Tag {
  name: string
  itemCount: number
}

// ── Vault ─────────────────────────────────────────────────────────────────────

export interface VaultItem {
  id: string
  service: string
  url?: string
  username?: string
  ciphertext: string  // AES-256-GCM encrypted blob (base64)
  iv: string          // initialization vector (base64)
  createdAt: Date
  updatedAt: Date
}

export interface VaultMeta {
  salt: string  // PBKDF2 salt (base64), stored server-side, not secret
}

// ── API request/response shapes ───────────────────────────────────────────────

export interface CreateItemRequest {
  title?: string
  type?: ItemType
  content: string
  categories?: string[]
  tags?: string[]
  source: ItemSource
  sourceUrl?: string
}

export interface UpdateItemRequest {
  title?: string
  content?: string
  categories?: string[]
  tags?: string[]
}

export interface IngestUrlRequest {
  url: string
}

export interface IngestUrlResponse {
  preview: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'>
}

export interface SearchRequest {
  query: string
  type?: ItemType
  category?: string
  tag?: string
  limit?: number
}

export interface SearchResult {
  items: Item[]
  total: number
}

export interface ApiError {
  error: string
  details?: unknown
}

export interface HealthResponse {
  status: 'ok'
  service: string
  timestamp: string
}

export interface StatsResponse {
  totalItems: number
  aiEnriched: number   // items Ollama has classified (structured != {})
  pendingAI: number    // items still waiting for AI enrichment
  itemsByType: Record<ItemType, number>
  totalVaultItems: number
  recentActivity: number
}
