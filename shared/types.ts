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

export type ItemIntent = 'actionable' | 'reference' | 'idea'

/** User-owned triage level. Unlike `intent` (AI-assigned), re-classifying never changes it. */
export type ItemPriority = 'essential' | 'useful' | 'skip'

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
  intent?: ItemIntent
  priority?: ItemPriority | null
  /** Id of the item this one was derived from (e.g. recipe extracted from a video). */
  derivedFrom?: string | null
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

/** Developer knowledge saved from a link or caption (type stays 'link'). */
export type DevKnowledgeKind = 'repo' | 'prompt' | 'skill' | 'explainer' | 'tool'

export interface RepoData {
  kind: DevKnowledgeKind
  repoName?: string        // "owner/repo"
  repoUrl?: string
  owner?: string
  creatorHandle?: string   // who posted it (e.g. an Instagram handle), without the leading @
  platform?: 'github' | 'instagram' | 'youtube' | 'web'
  whatItDoes?: string      // plain-English "what it is / what it's for"
  promptText?: string      // for kind 'prompt' | 'skill'
  summary?: string
}

/** Structured explanation of a video/page, stored at `item.structured.explanation`. */
export interface ExplanationData {
  summary: string
  keyPoints: string[]
  /** Ordered how-to steps; empty when the source isn't instructional. */
  steps: string[]
  takeaways: string[]
  /** `<provider>:<model>` that produced it. */
  model: string
  generatedAt: string
  /** What the explanation was built from. */
  basis: 'transcript' | 'content' | 'description'
  /** True when the source text was cut (long video / page). */
  truncated: boolean
}

/** Optional per-click provider choice; omitted = the per-task default from Settings. */
export interface ExplainRequest {
  provider?: 'ollama' | 'claude' | 'gemini'
  /** Replace an existing explanation. */
  force?: boolean
}

export interface ExplainResponse {
  item: Item
  explanation: ExplanationData
}

export interface ExtractRecipeRequest {
  provider?: 'ollama' | 'claude' | 'gemini'
  /** Create another recipe even if one was already extracted from this item. */
  force?: boolean
}

export interface ExtractRecipeResponse {
  /** The new `type='recipe'` item (derivedFrom = the source item). */
  recipe: Item
  confidence: number
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

export interface LinkSummary {
  url: string
  title: string
  summary: string
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
  type: 'credential' | 'note'
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
  structured?: StructuredData
  intent?: ItemIntent
  priority?: ItemPriority | null
  confidence?: number
  /** Omit for the server default; send false for AI-classified captures so they enter the review queue. */
  reviewed?: boolean
}

export interface UpdateItemRequest {
  title?: string
  content?: string
  categories?: string[]
  tags?: string[]
  priority?: ItemPriority | null
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
  reviewed: number     // items user has confirmed
  unreviewed: number   // items awaiting user review
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

/** This week's saves grouped by the user's triage priority. */
export interface DigestPriority {
  counts: { essential: number; useful: number; skip: number; untriaged: number }
  /** Newest first, at most 5 each. */
  essential: Item[]
  useful: Item[]
}

export interface DigestResponse {
  period: string
  recentItems: Item[]
  byPriority: DigestPriority
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
  intent?: ItemIntent
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

/** An entity an item is linked to, with the other items that share it (GET /api/items/:id/entities). */
export interface ConnectedEntity {
  id: string
  name: string
  type: EntityType
  /** Every role this item has for the entity (e.g. ['director', 'cast']). */
  roles: string[]
  /** How many OTHER live, non-encrypted items link to this entity. */
  total: number
  /** Newest first, at most 5. */
  others: Array<{ id: string; title: string; type: ItemType }>
}

export interface ItemEntity {
  item_id: string
  entity_id: string
  role: string
  entity?: Entity // joined info
}
