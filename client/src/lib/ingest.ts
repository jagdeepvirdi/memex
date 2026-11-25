import type { Item, CreateItemRequest, ItemPriority, PlaceProposal } from '../../../shared/types'

/** What the ingest endpoints return as `preview`: an unsaved item. Text capture may also offer places found in the note. */
export type IngestPreview = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'embedding'> & {
  places?: PlaceProposal[]
  placesModel?: string
}

/**
 * Builds the POST /api/items payload from an ingest preview.
 *
 * Every capture path (URL, manual text, file, voice) used to hand-pick a handful of fields and
 * silently drop `structured`, `intent` and `confidence` — so repo/prompt data and the AI's own
 * assessment were lost on save. One shared builder keeps the paths from drifting apart again.
 *
 * `reviewed` is passed through as-is: previews arrive with `reviewed: false`, so AI-classified
 * captures land in the review queue instead of being marked reviewed on save.
 *
 * `keptPlaces` are the places the user left ticked in the preview; without it no place is created.
 */
export function previewToCreateRequest(
  preview: IngestPreview,
  priority: ItemPriority | null = null,
  keptPlaces: PlaceProposal[] = [],
): CreateItemRequest {
  return {
    title: preview.title,
    type: preview.type,
    content: preview.content,
    categories: preview.categories,
    tags: preview.tags,
    source: preview.source,
    sourceUrl: preview.sourceUrl,
    structured: preview.structured,
    intent: preview.intent,
    confidence: preview.confidence,
    reviewed: preview.reviewed,
    priority,
    ...(keptPlaces.length > 0
      ? {
          // `evidence` is for display only; the server rebuilds it from the note.
          places: keptPlaces.map(({ evidence: _evidence, ...p }) => p),
          ...(preview.placesModel ? { placesModel: preview.placesModel } : {}),
        }
      : {}),
  }
}
