-- Migration 003 — soft-delete + category path ordering
--
-- deleted_at: enables soft-delete on items (filtered from all reads)
-- depth:      records each category's position in the path (0=root, 1=mid, 2=leaf)
--             so queries can do ORDER BY depth instead of a recursive CTE

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS items_deleted_at_idx
  ON items (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE item_categories
  ADD COLUMN IF NOT EXISTS depth INTEGER NOT NULL DEFAULT 0;
