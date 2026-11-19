---
name: Memex
description: Personal Knowledge OS — capture, connect, and recall what matters.
colors:
  midnight: "#0B0E14"
  porcelain: "#F5F7FB"
  ink-light: "#E9EEF6"
  ink-dark: "#121826"
  iris-dark: "#7C83FF"
  iris-light: "#5558E8"
  jade-dark: "#5EEAD4"
  jade-light: "#0F766E"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "7px"
  input: "8px"
  button: "9px"
  card: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  brand-mark:
    size: "32px"
  brand-lockup:
    size: "32px"
    typography: "{typography.body}"
---

## Overview

Memex is a self-hosted Personal Knowledge OS. Its identity is a folded ribbon forming an abstract M with a cream page-fold in the right stem: capture and recall as one continuous gesture, and saved material becoming a page of connected knowledge. The mark is a blue-violet gradient, legible at small sizes, and identical in both themes; only the wordmark colour and icon ground change.

The interface uses a dark graphite and light porcelain foundation, readable sans-serif body text, and restrained iris and jade accents. The application tokens live in `client/src/index.css` and are consumed by Tailwind in `client/tailwind.config.ts`; matching public-site tokens live in `site/style.css`. Shared React primitives live in `client/src/components/ui/`. Feature screens may retain specialized layouts, but should use these semantic roles and interaction conventions.

## Colors

- **Midnight** (`#0B0E14`) and **Porcelain** (`#F5F7FB`) are the dark and light application grounds.
- **Ink** is `#E9EEF6` on dark surfaces and `#121826` on light surfaces.
- **Iris** is `#7C83FF` on dark surfaces and `#5558E8` on light surfaces. It carries brand emphasis and primary action.
- **Jade** is `#5EEAD4` on dark surfaces and `#0F766E` on light surfaces. It marks privacy/local status.
- The logo is supplied as two lockups: white wordmark for dark backgrounds, navy wordmark for light backgrounds. The mark's gradient is the same in both.
- Keep semantic state colors reserved for actual states; do not add decorative accent colors to the brand.

## Typography

- Application and site body text use the existing self-hosted DM Sans assets on the public site and current application font configuration.
- Playfair Display is the existing display face for editorial headings; use it selectively. The wordmark uses a compact, medium-weight sans voice.
- JetBrains Mono is reserved for code, identifiers, and technical metadata.

## Layout

The brand mark is an inline symbol paired with the wordmark. Use a consistent 3:1 mark-to-wordmark height relationship in application headers; the standalone symbol is used for compact spaces. Preserve the mark's proportions and generous clear space. Layout and responsive rules for application screens remain defined by the existing implementation pending Phase 2.

## Elevation & Depth

The identity mark itself is flat vector geometry: no shadow, gradient, glow, texture, or simulated paper. Use tonal surfaces first; reserve `--shadow-card` for cards and `--shadow-raised` for overlays or floating menus. Avoid stacking multiple heavy shadows.

## Foundations

- **Spacing:** 4px base rhythm; `--space-1` through `--space-12` are 4, 8, 12, 16, 20, 24, 32, 40, and 48px. Use larger responsive gutters where the content needs room.
- **Type:** body DM Sans, 14.5px default with 1.5 line height; display Playfair Display only for selected editorial headings. Use JetBrains Mono for code and technical values. Prefer the named Tailwind type steps; do not use uppercase tracking for long or frequently read copy.
- **Radii:** 6px small, 8px controls, 12px cards, 16px panels, and pill only for compact chips/status.
- **Borders and elevation:** subtle 8–10% overlay borders for grouping; use stronger borders for selected/focused surfaces. Maintain clear separation in both themes.
- **Breakpoints:** Tailwind `sm` 640px, `md` 768px, `lg` 1024px. Treat these as layout change points, not target devices. Allow content to wrap before controls collide.
- **Icons:** use the existing Lucide React set. Keep related icon sizes/stroke weights consistent, pair unfamiliar icons with text, and give icon-only controls an accessible name. Avoid emoji as interface icons.
- **Motion:** standard easing is `cubic-bezier(0.2, 0, 0, 1)`; typical feedback is 120–180ms. Prefer opacity/transform; honor reduced-motion preferences globally and keep motion informative rather than decorative.
- **Focus:** all interactive controls must expose a visible 2px focus ring with offset. Do not remove native focus without replacing it. Keep vault focus in jade where the vault scope already provides it.
- **Themes:** dark is graphite surfaces with soft white text; light is porcelain grounds, white surfaces, and graphite text. Iris denotes primary interaction; jade denotes vault/local status. Reserve red, amber, and green for actual status meaning. Do not encode meaning by color alone.

## Shared component patterns

`client/src/components/ui/index.tsx` exports the first reusable primitives: `Button`, `TextField`, `SearchField`, `Card`, `Badge`, `Tabs`, `EmptyState`, and `LoadingState`.

- Buttons use native `<button>`, explicit variants/sizes, native disabled state, and `aria-busy` while loading. Icon-only use requires `aria-label` from the caller.
- Text fields have a visible label, optional hint, and an announced error linked through `aria-describedby`; validation also sets `aria-invalid`.
- Tabs use `role=tablist`/`tab`, selected state, one tab stop, and arrow/Home/End keyboard movement. Pair with labeled tab panels in the consuming feature.
- Empty states explain what the area is for and offer a next action when one exists. Loading states announce concise progress through `role=status`.
- Cards are semantic-neutral containers; choose a heading/section/article at the feature layer. Badges are short labels, not the only carrier of status.
- Use native dialog/select behavior where it meets the need; Sonner remains the toast system. Menus and context actions must retain keyboard operation, escape/close behavior, and focus restoration when introduced or revised.
- Navigation uses links for destinations and buttons for actions; expose the current location with `aria-current="page"` and preserve visible focus. Dense data uses native table semantics with a caption, column headers, and an overflow wrapper on narrow layouts.
- Dialogs/drawers need an accessible title, modal semantics when blocking, Escape/close behavior, and focus return to the trigger. Use native `<dialog>` where compatible with the interaction; do not simulate menus with hover-only content.
- Dropdown/select controls should use native `<select>` for simple choice. Tooltips add supplementary detail and must not be the only label or critical instruction. Context menus should also expose the same actions through a keyboard/touch-accessible path.
- Toasts use the existing Sonner integration; keep messages concise, avoid putting the only error detail in a transient toast, and provide an action only when it is safe and clear.

Do not force every view into one card or page template. Shared primitives standardize tokens and behavior while feature-specific composition remains intentional.

## Shapes

The mark is a rounded folded ribbon with one cream page-fold. Do not redraw it as a conventional typed M or place the transparent mark inside a decorative badge. App icons use the mark on a solid dark or light tile (generated by `brand/generate-assets.py`).

## Components

- **Brand lockup:** symbol left, “Memex” wordmark right, vertically centered. Use the theme-appropriate symbol; screen readers should announce the wordmark once, not the decorative symbol twice.
- **Standalone mark:** use for sidebar, login, onboarding, app icon, favicon, and compact contexts. The supplied logo has no monochrome variant; ask before inventing one.
- The two supplied logo PNGs in `brand/source/` are the masters. `python brand/generate-assets.py` rebuilds every derived asset and the deployment copies.

## Do's and Don'ts

### Do

- Do use the supplied dark or light lockup for its matching background (the dark lockup's white wordmark disappears on light surfaces).
- Do preserve the cream fold at icon sizes; increase the whole mark proportionally when a reproduction loses it.
- Do use the mark and wordmark together at first brand contact, and the symbol alone only where space is constrained or the name is already clear.
- Do keep public claims grounded in the product and its actual privacy controls.

### Don't

- Don't use the old plain “M” tile as a logo or make a final identity asset from generated raster artwork.
- Don't recolor, rotate, stretch, outline, crop, or add effects to the mark.
- Don't imply absolute privacy or that cloud AI is unavailable; cloud AI is optional and user-configured.
- Don't invent social proof, user counts, performance numbers, or security certifications.
