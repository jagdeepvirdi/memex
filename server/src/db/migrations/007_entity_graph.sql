-- Migration 007 — Entity Graph
-- Promotes recurring strings (directors, authors, locations) to first-class entities.

CREATE TYPE entity_type AS ENUM ('person', 'place', 'organization', 'other');

CREATE TABLE IF NOT EXISTS entities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  type        entity_type NOT NULL DEFAULT 'other',
  embedding   vector(768), -- For entity resolution (nomic-embed-text)
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure we don't have exact duplicates of name + type
CREATE UNIQUE INDEX IF NOT EXISTS entities_name_type_uniq ON entities (name, type);

-- Junction table linking items to entities with a 'role'
CREATE TABLE IF NOT EXISTS item_entities (
  item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role       TEXT, -- e.g., 'director', 'author', 'cast', 'location', 'mention'
  PRIMARY KEY (item_id, entity_id, role)
);

CREATE INDEX IF NOT EXISTS item_entities_item_id_idx ON item_entities (item_id);
CREATE INDEX IF NOT EXISTS item_entities_entity_id_idx ON item_entities (entity_id);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER entities_set_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
