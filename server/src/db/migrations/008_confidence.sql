-- Migration 008 — Confidence Score
-- Adds a confidence score column to items to track AI extraction quality.

ALTER TABLE items ADD COLUMN IF NOT EXISTS confidence FLOAT;
CREATE INDEX IF NOT EXISTS items_confidence_idx ON items (confidence ASC NULLS LAST);
