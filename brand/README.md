# Memex identity assets

## The logo

A folded ribbon forms an abstract `M`; a cream page-fold sits inside its right stem. The wordmark is set in a rounded geometric sans with the tagline "Your personal knowledge OS" underneath. The mark uses a blue-violet gradient and does not change between themes; only the wordmark colour and the icon ground do.

## Masters

The two supplied raster logos are the source of truth. They are not vectors, so every derived asset is built from them:

- `source/memex-logo-dark.png`: lockup on the dark ground (white wordmark).
- `source/memex-logo-light.png`: lockup on the light ground (navy wordmark).

## Generated assets

`python brand/generate-assets.py` (needs `pillow`, `numpy`, `scipy`) removes the flat backgrounds, crops, and writes:

- `memex-lockup-dark.png`, `memex-lockup-light.png`: transparent lockups, 1600px wide. Use the one that matches the background.
- `memex-mark.png`, `memex-mark-light.png`: standalone mark on a square transparent canvas (dark / light theme).
- `memex-icon-dark.png`, `memex-icon-light.png`: 1024px app icon, rounded tile.
- `favicon-16/32/48.png`, `favicon.ico`: the mark alone on transparent.
- `social-preview.png`: 1200x630 card.
- PWA icons in `client/public/`: `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png` (full bleed, mark inside the safe zone), `apple-touch-icon.png`, and `favicon.ico`.

The script also copies the brand PNGs to `client/public/brand/` and `site/brand/` (and removes any old `.svg` there). Run it again after replacing a master.

## Usage

- Use the lockup that matches its background; never put the dark lockup on a light surface (the white wordmark disappears).
- Do not recolour, rotate, stretch, outline or add effects to the mark. There is no monochrome or vector version; ask for one before inventing it.
- Keep clear space of at least the height of the wordmark's "M" stem around the lockup.
