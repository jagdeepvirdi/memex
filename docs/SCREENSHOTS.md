# Memex — Screenshot Reference

All screenshots live in `docs/screenshots/`. After capturing, the README already has placeholder slots — just drop the files in and they render automatically.

**Recommended setup before capturing:**
- Browser: Chrome or Edge, 1440 px wide window, default zoom (100%)
- Dark mode on (Memex is dark-only so this is automatic)
- Have at least 50–100 items imported and AI-enriched before starting
- Sidebar should be visible (not collapsed)
- No browser DevTools open, no browser UI distractions

---

## Screenshot List

| # | File | README section | Priority |
|---|---|---|---|
| 1 | `dashboard.png` | Hero (just below tagline) | Must have |
| 2 | `quick-add-preview.png` | Ingest section | Must have |
| 3 | `item-detail.png` | AI Classification section | Must have |
| 4 | `table-view.png` | Views table | Must have |
| 5 | `table-nl-filter.png` | Natural Language Filters section | Must have |
| 6 | `ask-memex.png` | Ask Your Knowledge section | Must have |
| 7 | `media-view.png` | Views table | High |
| 8 | `places-view.png` | Views table | High |
| 9 | `weekly-digest.png` | Weekly Digest section | High |
| 10 | `sidebar-enrichment.png` | Importing Google Keep section | High |
| 11 | `category-review.png` | AI Classification section | Medium |
| 12 | `entity-graph.png` | Entity Graph section | Medium |
| 13 | `vault.png` | Password Vault section | Medium |
| 14 | `item-link-summaries.png` | AI Classification section | Medium |
| 15 | `settings.png` | Environment Variables section | Low |

---

## Detailed Test Cases

---

### 1. `dashboard.png`
**README position:** Immediately after the "What it does" bullet list — the hero image.

**Pre-conditions:**
- At least 50 items imported and AI-enriched
- At least 3 items created more than 30 days ago (so the Rediscover widget has something to show)
- At least 1 item with a reminder set in the next 7 days
- Insights widget has loaded (wait a few seconds after page load)

**Steps:**
1. Navigate to `http://localhost:5175/`
2. Wait for the Insights cards to fully render (they stagger in)
3. Make sure the Rediscover widget shows at least one item
4. Scroll so the full stats grid AND the insights section are visible above the fold

**What must be visible:**
- Stats grid (5 cards: Total Items, AI Enriched, Reviewed, Secrets in Vault, Last 24h Activity) with non-zero numbers
- At least 2 Insight cards with text
- Rediscover widget with one item card
- Sidebar with category tree and the Ollama status pill (green "AI Online")
- AppHeader at the top

**Capture:** Full page width, top ~900 px (above fold only — do not scroll)

---

### 2. `quick-add-preview.png`
**README position:** After the "Importing Google Keep" section, introduce general ingestion.

**Pre-conditions:**
- Ollama must be running and online (green pill in AppHeader)
- Any page loaded (modal overlays the current page)

**Steps:**
1. Press `Ctrl+N` (or `Cmd+N` on Mac) to open Quick Add
2. Click the **URL** tab
3. Paste a real article URL — use something with a clear title and content, e.g. a Wikipedia article or a tech blog post
4. Click **Preview**
5. Wait for the AI classification to complete (spinner → preview card appears)
6. The preview card should show: title, type badge, categories, tags, summary, and confidence score

**What must be visible:**
- The Quick Add modal centred over a blurred background
- URL tab selected
- Preview card fully rendered with type badge (e.g. "link"), category chips, tags, and the AI summary text
- If a similar item exists, the amber duplicate warning card is a bonus — try a URL you may have saved before

**Capture:** The modal only (crop tightly around it), or the full viewport showing the modal centred

---

### 3. `item-detail.png`
**README position:** AI Classification section — shows the output of classification on a real item.

**Pre-conditions:**
- Navigate to an item that has been AI-enriched AND has a URL or two in its content
- Best candidates: a Keep note about a movie, recipe, or travel destination that Ollama has fully classified
- The item should already have link summaries generated (click "Summarize Links" on the item first if not done yet)

**Steps:**
1. From the Dashboard or Table View, click into a well-enriched item
2. Confirm the AI Summary card is visible with text
3. If the note has links and `linkSummaries` are present, the "Links in this note" section should be visible inside the AI Summary card
4. Scroll so the following are all visible at once: title, intent badge, AI Summary card (with link summaries if present), and the top of the Content area

**What must be visible:**
- Large title at the top
- Category pill and date chip in the metadata row
- Intent badge (⚡ Actionable or 💡 Idea or 📖 Reference)
- AI Summary card with summary text
- "Links in this note" sub-section with at least one link title + summary (if the note has links)

**Capture:** Main content area, top ~700 px. Sidebar visible on the left.

---

### 4. `table-view.png`
**README position:** Views table row for `/items/table`.

**Pre-conditions:**
- At least 30 enriched items of mixed types (notes, recipes, movies, places, links)
- No active filters (show "All" state)

**Steps:**
1. Navigate to `http://localhost:5175/items/table`
2. Make sure the filter bar is visible at the top and type pills are all in default state
3. Scroll down slightly so the table has at least 10 rows visible
4. Do NOT expand any row — keep the compact table view

**What must be visible:**
- Filter bar with type pill toggles (All / Note / Recipe / Media / Book / Link…)
- Table header row (Title, Type, Categories, Tags, Summary, Created, Reviewed)
- At least 8 rows with mixed types — different type badges in colour
- Confidence score column with colour-coded values (green ≥80, amber 60–79, red <60)
- A few rows with the reviewed checkmark (✓)

**Capture:** Full viewport width, top ~800 px

---

### 5. `table-nl-filter.png`
**README position:** Natural Language Filters section — the key demo of the NL feature.

**Pre-conditions:**
- At least 5 place-type items with `cuisine` and `visitStatus` fields in structured data

**Steps:**
1. Navigate to `http://localhost:5175/items/table`
2. Click the sparkle ✨ **Ask AI** toggle button (top-right of the filter bar)
3. The search input turns purple with a "Ask a filter…" placeholder
4. Type: `Thai restaurants I haven't visited` and press Enter (or click Send)
5. Wait for Ollama to parse the query
6. Results appear, and below the filter bar you see "Interpreted as:" badge row showing parsed components

**What must be visible:**
- Purple NL input with the query text still visible
- "Interpreted as:" row below the filter bar with coloured badges: `type: place`, `cuisine: Thai`, `visitStatus: want-to-visit`
- Filtered results in the table (even if 0 results, the parsed badges should be shown)

**Capture:** Filter bar + badge row + top of table results. Full width, ~500 px tall.

---

### 6. `ask-memex.png`
**README position:** Ask Your Knowledge section.

**Pre-conditions:**
- At least 20 items with embeddings generated (any enriched item has an embedding)
- The question should have a real answer in your library — pick a question you know the answer to based on your notes

**Steps:**
1. Navigate to `http://localhost:5175/ask`
2. Type a question in the chat input that you know has an answer in your notes. Examples:
   - "What recipes do I have with chicken?"
   - "Which movies do I want to watch?"
   - "What did I save about Bangkok?"
3. Press Enter and wait for the answer to stream in
4. The answer should appear with source citations below it

**What must be visible:**
- The question in the chat bubble (right-aligned, amber/accent background)
- The answer text fully rendered with 2–4 paragraphs
- Source citation cards below the answer — each showing item title, type badge, and a snippet

**Capture:** The full chat column. Crop the sidebar out if it makes the answer hard to read. ~700 px wide, full height of the answer.

---

### 7. `media-view.png`
**README position:** Views table row for `/media`.

**Pre-conditions:**
- At least 8 movie/book items with structured data (genre, year, director/author, watch/read status, user ratings)
- At least 2 items with star ratings set (click the stars inline before screenshotting)

**Steps:**
1. Navigate to `http://localhost:5175/media`
2. Make sure both Movies and Books sections are visible
3. Set a star rating on 2–3 items using the inline star selector so ratings are shown

**What must be visible:**
- Section headers "Movies" and "Books"
- Item rows with: title, type badge, genre, year, watch/read status pill (e.g. "Want to Watch", "Read"), star rating
- CSV export button visible in the header

**Capture:** Full viewport, scrolled to show a mix of movies and books rows

---

### 8. `places-view.png`
**README position:** Views table row for `/places`.

**Pre-conditions:**
- At least 6 place items with `city`, `cuisine`, `visitStatus`, and ideally `userRating` fields
- Mix of visited and want-to-visit

**Steps:**
1. Navigate to `http://localhost:5175/places`
2. Make sure the table has items loaded

**What must be visible:**
- Table rows with: place name, type badge (restaurant/café/hotel), cuisine, city, visit status pill (colour-coded: green = visited, amber = want-to-visit), star rating, Maps link icon
- CSV export button in the header

**Capture:** Full viewport width, top ~600 px showing the filter bar and first 6–8 rows

---

### 9. `weekly-digest.png`
**README position:** Weekly Digest section.

**Pre-conditions:**
- At least 5 items saved in the last 7 days
- At least 1 item saved on this calendar date in a prior year (for the "on this day" card)
- At least 10 reviewed items with structured data (for the AI connection to work)
- Navigate to the digest page manually (it auto-redirects on Mondays, but you can go directly)

**Steps:**
1. Navigate to `http://localhost:5175/digest`
2. Wait for the AI connection card to load (it calls Ollama — may take 5–10 seconds)
3. Scroll to show the "This Week" stat card, the item grid, and the "On This Day" memory card

**What must be visible:**
- "This Week" stat card with item count and trend arrow (↑ or ↓ vs last week)
- A 2–3 column grid of this week's saved items
- "On This Day" memory card (dark amber border) with a past item
- Ideally: the AI Connection card at the bottom showing two item tiles + the AI insight quote

**Capture:** Full page width, scroll to show all four sections. May need two shots if it's tall — take the top half showing the stat + grid first.

---

### 10. `sidebar-enrichment.png`
**README position:** Importing Google Keep section — shows the live ETA during import.

**Pre-conditions:**
- Trigger a Keep import with a large ZIP (or use a previously-imported batch that's still enriching)
- Enrichment must be actively running (pending items in the queue)

**Steps:**
1. Import a Google Keep ZIP via Quick Add → Keep Import
2. Immediately after uploading, watch the sidebar
3. The enrichment progress bar + ETA widget appears at the bottom of the sidebar
4. Capture while enrichment is actively running (e.g. "47 / 200 enriched · ~14 min left · 3.2 notes/min")

**What must be visible:**
- The sidebar category tree (at least 4–5 categories with item counts)
- The enrichment progress widget at the bottom: progress bar, "X / Y enriched" counter, ETA, and rate (notes/min)
- The Ollama status pill should be green "AI Online"
- AppHeader visible at the top with the enrichment progress also reflected there

**Capture:** Sidebar only — crop to just the sidebar column (~280 px wide), full height

---

### 11. `category-review.png`
**README position:** AI Classification section — shows the staging queue.

**Pre-conditions:**
- At least 5 items with confidence score below 70 that are unreviewed
- Navigate to the review page while at least one anomaly exists

**Steps:**
1. Navigate to `http://localhost:5175/categories/review`
2. Make sure the **Staged Items** tab is selected (default)
3. The confidence threshold slider should be at 70 (default)
4. At least 2–3 item cards should be visible

**What must be visible:**
- The two tabs: "Staged Items" and "Category Anomalies" — "Staged Items" active
- Confidence threshold slider showing "≤ 70%"
- At least 2 item cards each showing: title, confidence score badge, current AI-suggested categories, Accept / Reassign / Reassign All buttons
- Intent badge visible on at least one card (⚡ or 💡 or 📖)

**Capture:** Main content area, top ~700 px. Full width.

---

### 12. `entity-graph.png`
**README position:** Entity Graph section.

**Pre-conditions:**
- At least 15 media/book/place items enriched so the entity graph has enough nodes
- The graph will be empty if no entities have been extracted yet — run the seed script first if needed:
  ```bash
  cd server && npx tsx src/scripts/seedEntityGraph.ts
  ```

**Steps:**
1. Navigate to `http://localhost:5175/graph`
2. Wait for the graph to fully render (may take 2–3 seconds)
3. Click and drag a few nodes so they spread out and don't overlap
4. The graph should show coloured nodes (person = one colour, place = another) connected by labelled edges

**What must be visible:**
- At least 10 nodes spread across the canvas
- Node labels visible (director names, city names, author names)
- Edge lines connecting related nodes
- A few clusters visible (e.g. a director connected to multiple movie nodes)
- The legend or node type colour key if visible

**Capture:** Full canvas area. Zoom out in the graph if needed to show the full connected layout.

---

### 13. `vault.png`
**README position:** Password Vault section.

**Pre-conditions:**
- Vault must be set up (go through the setup flow first)
- Vault must be unlocked
- At least 3 vault items added — use fake/placeholder credentials for the screenshot (do NOT use real passwords)

**Steps:**
1. Navigate to `http://localhost:5175/vault`
2. Unlock the vault with your master password
3. The vault item list should be visible

**What must be visible:**
- The vault header with the lock icon and "Vault" title
- At least 3 vault items in the list — each showing service name and username (the secret is never shown in the list)
- The "Add Credential" button visible
- The green "Unlocked" status indicator

**Important:** Use fake credentials only. Examples: `GitHub / dev@example.com`, `Netflix / user@example.com`. Do NOT capture real passwords or real usernames.

**Capture:** Main vault content area, full width. Blur or black-bar the username fields if they contain anything real.

---

### 14. `item-link-summaries.png`
**README position:** AI Classification section — showcases the link summarisation feature.

**Pre-conditions:**
- Find a note (from Keep or manual entry) that contains 2–3 URLs in its content
- Click "Summarize Links" on that item first and wait for Ollama to finish (may take 20–40 seconds per link)
- Reload the item page after summarisation completes

**Steps:**
1. Navigate to the item detail page of a note with links
2. Scroll to the **AI Summary** card
3. The card should show the item's summary at the top AND a "Links in this note" sub-section below with each link's title and summary

**What must be visible:**
- The AI Summary card (amber Sparkles icon, "AI Summary" label)
- The item's own 2–3 sentence summary
- "Links in this note" sub-header with the chain link icon
- At least 2 link summary cards, each showing: link title (clickable, accent colour), and the 2–3 sentence summary text below it

**Capture:** Just the AI Summary card and a bit of surrounding context. ~600 px wide, tall enough to show both the summary and two link cards.

---

### 15. `settings.png`
**README position:** Environment Variables section — shows the runtime model switching.

**Pre-conditions:**
- None — Settings page is always accessible

**Steps:**
1. Navigate to `http://localhost:5175/settings`
2. Scroll to the **Intelligence Engine** section

**What must be visible:**
- Model selector dropdown (showing current model: `llama3.2` or `gemma3:4b`)
- Ollama health status badge (green "Connected" or "Online")
- MarkItDown status badge (green "Installed" or amber "Not installed")
- Whisper status badge
- The Bookmarklet section showing the draggable "Save to Memex" button and the copy button

**Capture:** The Intelligence Engine section and Bookmarklet section. Full width, ~600 px tall.

---

## Folder Structure

Save all files to:
```
docs/
└── screenshots/
    ├── dashboard.png
    ├── quick-add-preview.png
    ├── item-detail.png
    ├── table-view.png
    ├── table-nl-filter.png
    ├── ask-memex.png
    ├── media-view.png
    ├── places-view.png
    ├── weekly-digest.png
    ├── sidebar-enrichment.png
    ├── category-review.png
    ├── entity-graph.png
    ├── vault.png
    ├── item-link-summaries.png
    └── settings.png
```

---

## Where Each Screenshot Goes in README.md

Once files are in place, add these lines to the README at the indicated positions:

**After "What it does" bullet list (hero):**
```markdown
![Memex Dashboard](docs/screenshots/dashboard.png)
```

**After "Importing Google Keep" section:**
```markdown
![Sidebar enrichment progress](docs/screenshots/sidebar-enrichment.png)
```

**After "AI Classification" section heading:**
```markdown
![Item detail with AI summary and link summaries](docs/screenshots/item-detail.png)
![Category review staging queue](docs/screenshots/category-review.png)
```

**After "Ask Your Knowledge" section heading:**
```markdown
![Ask Memex RAG chat](docs/screenshots/ask-memex.png)
```

**After "Natural Language Filters" section heading:**
```markdown
![Natural language filter with parsed badges](docs/screenshots/table-nl-filter.png)
```

**After "Weekly Digest" section heading:**
```markdown
![Weekly digest newspaper layout](docs/screenshots/weekly-digest.png)
```

**After "Entity Graph" section heading:**
```markdown
![Entity relationship graph](docs/screenshots/entity-graph.png)
```

**After "Password Vault" section heading:**
```markdown
![Password vault](docs/screenshots/vault.png)
```

**After the Views table:**
```markdown
### Views

| Screenshot | Description |
|---|---|
| ![Table view](docs/screenshots/table-view.png) | Dense table with filters and bulk review |
| ![Media view](docs/screenshots/media-view.png) | Movies and books library |
| ![Places view](docs/screenshots/places-view.png) | Restaurants and places with Maps links |
```

---

## Tips

- **Resolution:** Aim for 1440 × 900 minimum. GitHub renders images at full column width (~820 px in a standard README) so anything above 1440 px wide is downscaled — that's fine and looks sharp on retina.
- **Format:** PNG preferred over JPEG for UI screenshots (no compression artefacts on text).
- **Compression:** Run through [Squoosh](https://squoosh.app/) or `pngquant` before committing to keep the repo size reasonable. Target < 300 KB per screenshot.
- **Sensitive data:** For the vault screenshot, always use fake credentials. For other screenshots, scan for any real personal data (phone numbers, emails, addresses from Keep notes) and blur them out before committing.
- **macOS tip:** `Cmd+Shift+4` then `Space` then click the window captures just the browser window without the OS chrome.
- **Windows tip:** `Win+Shift+S` for a region snip, or use the ShareX tool for consistent crops.
