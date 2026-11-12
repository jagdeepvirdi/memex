-- User-owned priority: essential | useful | skip (nullable = not triaged yet).
-- Separate from `intent`, which is AI-assigned and overwritten on re-classify.
-- Plain VARCHAR with no CHECK, matching `intent` (016); validation lives in the API (zod).
ALTER TABLE items ADD COLUMN IF NOT EXISTS priority VARCHAR(20);
