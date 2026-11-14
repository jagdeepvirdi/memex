-- Link an item to the item it was derived from (e.g. a recipe extracted from a YouTube video item).
-- ON DELETE SET NULL: deleting the source never deletes the derived item.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS derived_from UUID REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_derived_from_idx ON items (derived_from) WHERE derived_from IS NOT NULL;
