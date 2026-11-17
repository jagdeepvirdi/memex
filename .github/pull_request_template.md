## What and why

## Checked
- [ ] `npx tsc --noEmit` is clean in `server/` and `client/`
- [ ] Tests added or updated; `npm test` passes
- [ ] No personal data in the diff (real notes, keys, `.env`, backups); test fixtures are made up
- [ ] Anything that sends text to a cloud AI goes through `cloudSafe()` and the consent checks
