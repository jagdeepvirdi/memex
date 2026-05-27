-- Migration 005 — AI Review flag
-- Tracks if the user has confirmed/reviewed the AI's classification

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS items_reviewed_idx ON items (reviewed) WHERE NOT reviewed;
