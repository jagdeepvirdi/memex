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
  | 'place'

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
  confidence?: number
  remindAt?: Date | null
  publicToken?: string | null
  shareExpiresAt?: Date | null
}

// ── Structured data per type ──────────────────────────────────────────────────

export type StructuredData =
  | RecipeData
  | MediaData
  | BookData
  | StockData
  | SpecData
  | PlaceData
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
  cast?: string[]
  rating?: number
  watched?: boolean
  watchStatus?: 'watched' | 'want-to-watch' | 'watching'
  userRating?: number // 1-5
  streamingPlatform?: string
  summary?: string
}

export interface BookData {
  author?: string
  genre?: string
  year?: number
  status?: 'want-to-read' | 'reading' | 'read'
  userRating?: number // 1-5
  highlights?: string[]
  summary?: string
}

export interface PlaceData {
  name: string
  type: 'restaurant' | 'cafe' | 'hotel' | 'attraction' | 'destination' | 'other'
  cuisine?: string
  city?: string
  country?: string
  address?: string
  visitStatus: 'visited' | 'want-to-visit' | 'want-to-revisit'
  userRating?: number // 1-5
  priceRange?: '$' | '$$' | '$$$'
  notes?: string
  mapsUrl?: string
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

export interface CategoryAnomaly {
  id: string
  name: string
  itemCount: number
  suggestedPath: string[]
  previewItems: Array<{ id: string; title: string; type: string }>
}

export interface RemapCategoryRequest {
  fromRootId: string
  toPath: string[]
}

export interface RemapCategoryResponse {
  remapped: number
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

export interface VaultStatus {
  hasSetup: boolean
  salt?: string
  verifier?: string | null
  verifierIv?: string | null
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
  remindAt?: string | null  // ISO datetime string, null to clear
}

export interface IngestUrlRequest {
  url: string
}

export interface SimilarItem {
  id: string
  title: string
  type: ItemType
  similarity: number  // 0–1 cosine similarity
}

export interface IngestUrlResponse {
  preview: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'>
  similarItems: SimilarItem[]
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

export interface Insight {
  id: string
  title: string
  description: string
  type: 'event' | 'habit' | 'suggestion' | 'connection'
  icon?: string
  priority: number // 1-5
}

export interface StatsResponse {
  totalItems: number
  aiEnriched: number   // items Ollama has classified (structured != {})
  pendingAI: number    // items still waiting for AI enrichment
  itemsByType: Record<ItemType, number>
  totalVaultItems: number
  recentActivity: number
}

// ── Weekly Digest ─────────────────────────────────────────────────────────────

export interface DigestConnection {
  item1: { id: string; title: string; type: string; summary: string }
  item2: { id: string; title: string; type: string; summary: string }
  insight: string
}

export interface DigestResponse {
  period: string
  recentItems: Item[]
  weekCount: number
  prevWeekCount: number
  onThisDay: RediscoveryItem | null
  connection: DigestConnection | null
}

// ── NL Filter ─────────────────────────────────────────────────────────────────

export interface ParsedFilter {
  type: ItemType | null
  searchQuery: string
  structuredFilters: Record<string, string>
}

export interface NLFilterResponse {
  items: Item[]
  total: number
  parsedFilter: ParsedFilter
}

// ── Data Provenance ───────────────────────────────────────────────────────────

export interface ItemExtraction {
  id: string
  item_id: string
  model: string
  type: ItemType
  title: string
  summary?: string
  structured: Record<string, unknown>
  categories: string[]
  tags: string[]
  confidence?: number
  applied: boolean
  created_at: string
}

// ── RAG Q&A ───────────────────────────────────────────────────────────────────

export interface AskRequest {
  question: string
}

export interface AskResponse {
  answer: string
  sources: Item[]
}

// ── Rediscovery ───────────────────────────────────────────────────────────────

export interface RediscoveryItem {
  type: 'on-this-day' | 'random' | 'forgotten'
  reason: string
  item: Item
}

// ── Entities ──────────────────────────────────────────────────────────────────

export type EntityType = 'person' | 'place' | 'organization' | 'other'

export interface Entity {
  id: string
  name: string
  type: EntityType
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ItemEntity {
  item_id: string
  entity_id: string
  role: string
  entity?: Entity // joined info
}
