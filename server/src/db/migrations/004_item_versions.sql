-- Migration 004 — Item versioning
-- Stores history of content changes for each item

CREATE TABLE IF NOT EXISTS item_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS item_versions_item_id_idx ON item_versions (item_id, created_at DESC);

-- Trigger to automatically create a version before content/title update
CREATE OR REPLACE FUNCTION create_item_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.title != NEW.title OR OLD.content != NEW.content) THEN
    INSERT INTO item_versions (item_id, title, content)
    VALUES (OLD.id, OLD.title, OLD.content);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER items_create_version
  BEFORE UPDATE ON items
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION create_item_version();
