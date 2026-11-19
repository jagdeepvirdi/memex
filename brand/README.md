# Memex identity assets

## Direction

The Memory Ribbon is a continuous, folded line forming an abstract `M`. Its two outer strokes suggest capture and retrieval; the small jade crease marks the fold where saved information becomes connected knowledge. The icon uses the same construction in color, monochrome, dark, and light variants.

## Concept exploration

The alternatives were drawn as small vector marks in `concepts/` and assessed against recognition at small sizes, connection to Memex's product mechanism, monochrome performance, and distinctiveness:

| Concept | Strength | Limitation | Decision |
|---|---|---|---|
| Memory Ribbon | Connects the user's preferred initial direction to capture, folding/connection, and recall in one continuous M gesture. | A letterform can become generic if the fold is too subtle; the inner crease must remain visible at small sizes. | Recommended and selected for this phase. |
| Index Aperture | Suggests an organized personal archive and layered retrieval. | Reads as a generic filing/document mark and does not communicate connected knowledge as directly. | Not selected. |
| Linked Recall | Makes relationships and discovery explicit. | Node-link marks are common in software and can read as a graph/analytics tool rather than a personal knowledge product. | Not selected. |

Additional directions considered during exploration were a typographic M ligature, a river/tributary network, a layered bookfolio, and an archive-drawer symbol. The first risks a generic lettermark; the map and node directions overemphasize graphing; the book and drawer directions lean toward storage and underplay retrieval. The selected mark keeps the strongest product cue while remaining a compact, reproducible geometric symbol.

## Palette and variants

- Dark ground: `#0B0E14`; dark wordmark: `#E9EEF6`; dark mark: `#7C83FF`; fold: `#5EEAD4`.
- Light ground: `#F5F7FB`; light wordmark: `#121826`; light mark: `#5558E8`; fold: `#0F766E`.
- Monochrome: use `memex-mark-mono.svg` or `memex-lockup-mono.svg` and set `currentColor` from the surrounding context.
- Keep the mark's proportions and fold visible. Do not add shadows, gradients, outlines, or backgrounds to the transparent standalone mark.

## Assets

- `memex-mark.svg`: transparent standalone symbol.
- `memex-lockup-dark.svg`, `memex-lockup-light.svg`, `memex-lockup-mono.svg`: primary lockup variants.
- `memex-icon-dark.svg`, `memex-icon-light.svg`: app icon vector masters.
- `favicon.svg`: dark browser favicon; `masked-icon.svg`: one-color pinned-tab symbol.
- Generated PNGs: `client/public/pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png`, and `site/brand/social-preview.png`.

Run `powershell -ExecutionPolicy Bypass -File brand/generate-assets.ps1` after editing the vector masters to refresh the deployed copies and PNG exports. The script uses Windows GDI+ only for raster exports; the SVG files remain the editable source of truth.
