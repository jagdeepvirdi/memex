-- Migration 009 — Data Provenance
-- raw_content: immutable copy of the original imported text, set once on creation, never overwritten
-- extraction_model: which AI model produced the current active structured/type/title on this item
-- item_extractions: full history of every AI extraction run per item, versioned by model + timestamp

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS raw_content TEXT,
  ADD COLUMN IF NOT EXISTS extraction_model TEXT;

-- Backfill: treat current content as the raw original for pre-existing items
UPDATE items SET raw_content = content WHERE raw_content IS NULL;

-- Versioned extraction log — one row per AI run per item
CREATE TABLE IF NOT EXISTS item_extractions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  model        TEXT        NOT NULL,
  type         TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  summary      TEXT,
  structured   JSONB       NOT NULL DEFAULT '{}',
  categories   TEXT[]      NOT NULL DEFAULT '{}',
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  confidence   FLOAT,
  applied      BOOLEAN     NOT NULL DEFAULT FALSE, -- TRUE = this extraction is currently reflected in items
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS item_extractions_item_id_idx
  ON item_extractions (item_id, created_at DESC);
