-- Migration 012 — Public sharing tokens
-- public_token: a random hex string that lets anyone read a single item
-- without authenticating. NULL means the item is private (default).

ALTER TABLE items ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS items_public_token_idx
  ON items (public_token)
  WHERE public_token IS NOT NULL;
