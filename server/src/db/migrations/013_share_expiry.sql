-- Migration 013 — Share token expiry
-- share_expires_at: optional expiry timestamp; NULL means permanent (legacy rows)
-- New shares default to 7 days from creation (set in application layer).

ALTER TABLE items ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMPTZ;
