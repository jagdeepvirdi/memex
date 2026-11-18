# Memex v1.2.0

Memex stays local-first. This release lets an AI assistant use your notes, adds a light theme, and cleans up the dependencies.

## Highlights

- **Use your notes from an AI assistant (MCP).** Claude Desktop, Cursor and other MCP apps can now search your Memex, read an item, and save a note or a web page, through a small server that runs on your computer. Ask "what did I save about the harbour restaurants?" or "save this recipe to Memex" in the assistant you already use. Set it up in Settings > Capture > AI assistants; the README has the two-minute steps.
  - **It has its own key, and the key can do very little.** It can search, read and save. It cannot delete, edit, export, or touch settings, API keys or the vault. Memex stores only a hash of it, shows it once, and you can revoke it at any time.
  - **Private items stay private.** The vault, Passwords and Personal, anything tagged `private`, `no-cloud` or `local-only`, and text that looks like account details are never returned. A search only says how many matches were held back.
  - **Strict Local Mode turns it off completely**, and there is deliberately no "ask" tool, so private text never ends up inside an answer that leaves your machine.
- **Light and dark themes.** A fresh palette: "Midnight" (dark) and "Daylight" (light), with an iris accent. It follows your system setting by default. Choose System, Light or Dark in Settings > Appearance, or with the button in the header. The landing page uses the same colours.
- **Better on a phone.** Page actions get their own row under the title, the library's rename and delete buttons work by touch, and the settings sections show when there is more to scroll to.
- **No known dependency advisories.** `zod` 4, `react-router-dom` 7 and a fix for `qs` bring both the server and the web app to zero reported advisories.

## Upgrading from 1.1.0

1. Pull the new code and restart the server. There are no new database migrations.
2. To use an AI assistant: `npm run mcp:build`, then create a key in Settings > Capture.
3. If you use Gemini embeddings and had calibrated similarity thresholds, restart the server so it loads them.

## Also in this release

- Fixes: link badges and chips that use the blue "sky" shades were never styled, and now are.
- New scripts for people who run their own checks: `verifyChatProvider.ts` (try any cloud provider and model with made-up text) and `switchEmbedding.ts` (switch the search model and re-embed from the command line, with an estimate first).
- The bookmarklet's save logic moved into a shared service; its behaviour is unchanged.
- CI checks the MCP server too, and the workflow actions are up to date.

Full list: [CHANGELOG.md](CHANGELOG.md).
