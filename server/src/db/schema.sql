-- Memex — canonical schema reference (reflects all 15 migrations)
-- This file is documentation only. The live DB is built by running migrations in order:
--   npm run migrate
-- Do not run this file directly against the DB.

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), crypt()

-- ── Enums ─────────────────────────────────────────────────────────────────────
-- item_type: 'place' added in Phase 2
CREATE TYPE item_type AS ENUM (
  'note', 'recipe', 'media', 'spec', 'stock', 'password', 'link', 'book', 'place'
);

CREATE TYPE item_source AS ENUM (
  'keep', 'manual', 'url', 'youtube', 'instagram'
);

-- entity_type added in migration 007
CREATE TYPE entity_type AS ENUM ('person', 'place', 'organization', 'other');

-- ── Categories (hierarchical tree) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_root_uniq
  ON categories (name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_child_uniq
  ON categories (name, parent_id) WHERE parent_id IS NOT NULL;

-- ── Items ─────────────────────────────────────────────────────────────────────
-- Columns added across migrations:
--   001: core columns
--   003: deleted_at (soft-delete)
--   005: reviewed
--   008: confidence
--   009: raw_content, extraction_model
--   011: remind_at
--   012: public_token
--   013: share_expires_at
CREATE TABLE IF NOT EXISTS items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  type             item_type   NOT NULL DEFAULT 'note',
  content          TEXT        NOT NULL DEFAULT '',
  raw_content      TEXT,                       -- 009: immutable original import text
  structured       JSONB       NOT NULL DEFAULT '{}',
  source           item_source NOT NULL DEFAULT 'manual',
  source_url       TEXT,
  content_hash     TEXT,                       -- MD5 for deduplication on Keep import
  embedding        vector(768),                -- nomic-embed-text (768 dims)
  encrypted        BOOLEAN     NOT NULL DEFAULT FALSE,
  reviewed         BOOLEAN     NOT NULL DEFAULT FALSE,  -- 005: user confirmed AI classification
  confidence       FLOAT,                      -- 008: AI self-assessed extraction quality 0-100
  extraction_model TEXT,                       -- 009: which model produced current structured data
  remind_at        TIMESTAMPTZ,                -- 011: optional reminder timestamp
  public_token     TEXT UNIQUE,               -- 012: random hex token for public sharing
  share_expires_at TIMESTAMPTZ,               -- 013: optional expiry for public share
  deleted_at       TIMESTAMPTZ,                -- 003: soft-delete
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_embedding_hnsw
  ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS items_fts
  ON items USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));
CREATE INDEX IF NOT EXISTS items_content_hash_idx ON items (content_hash);
CREATE INDEX IF NOT EXISTS items_type_idx         ON items (type);
CREATE INDEX IF NOT EXISTS items_created_at_idx   ON items (created_at DESC);
CREATE INDEX IF NOT EXISTS items_deleted_at_idx   ON items (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_reviewed_idx     ON items (reviewed) WHERE NOT reviewed;
CREATE INDEX IF NOT EXISTS items_confidence_idx   ON items (confidence ASC NULLS LAST);

-- ── Item–Category junction ────────────────────────────────────────────────────
-- depth column added in migration 003 for ordered path retrieval
CREATE TABLE IF NOT EXISTS item_categories (
  item_id      UUID    NOT NULL REFERENCES items(id)      ON DELETE CASCADE,
  category_id  UUID    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  depth        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, category_id)
);

-- ── Tags ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id  UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- ── Item versions (migration 004) ─────────────────────────────────────────────
-- Trigger automatically snapshots title+content before updates
CREATE TABLE IF NOT EXISTS item_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS item_versions_item_id_idx ON item_versions (item_id, created_at DESC);

-- ── AI Extraction provenance (migration 009) ──────────────────────────────────
-- Full log of every AI enrichment run per item
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
  applied      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS item_extractions_item_id_idx ON item_extractions (item_id, created_at DESC);

-- ── Entity graph (migration 007) ──────────────────────────────────────────────
-- Promotes recurring strings (directors, authors, cities) to relational entities
CREATE TABLE IF NOT EXISTS entities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  type        entity_type NOT NULL DEFAULT 'other',
  embedding   vector(768),
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS entities_name_type_uniq ON entities (name, type);

CREATE TABLE IF NOT EXISTS item_entities (
  item_id    UUID NOT NULL REFERENCES items(id)    ON DELETE CASCADE,
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role       TEXT,  -- 'director', 'author', 'cast', 'city', 'exchange', etc.
  PRIMARY KEY (item_id, entity_id, role)
);
CREATE INDEX IF NOT EXISTS item_entities_item_id_idx   ON item_entities (item_id);
CREATE INDEX IF NOT EXISTS item_entities_entity_id_idx ON item_entities (entity_id);

-- ── Settings key-value store (migration 006) ──────────────────────────────────
-- Defaults seeded: ai_model, use_claude, auto_lock_timeout, strict_local_mode
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Password Vault ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service     TEXT        NOT NULL,
  url         TEXT,
  username    TEXT,
  ciphertext  TEXT        NOT NULL,  -- AES-256-GCM encrypted, base64
  iv          TEXT        NOT NULL,  -- 12-byte IV, base64
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_config (
  id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt         TEXT NOT NULL,  -- PBKDF2 salt, base64, not secret
  verifier     TEXT,           -- AES-256-GCM encrypted sentinel (migration 015)
  verifier_iv  TEXT            -- IV for the verifier ciphertext
);

-- ── Ingest job tracking (migration 014) ──────────────────────────────────────
-- DB-backed job store so Keep import progress survives server restarts.
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id           UUID        PRIMARY KEY,
  status       TEXT        NOT NULL DEFAULT 'processing',
  progress     INTEGER     NOT NULL DEFAULT 0,
  total        INTEGER     NOT NULL DEFAULT 0,
  completed    INTEGER     NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS ingest_jobs_status_idx ON ingest_jobs (status);

-- ── Auth (single-user) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        NOT NULL UNIQUE,
  password_hash  TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Triggers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER items_set_updated_at
  BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER vault_items_set_updated_at
  BEFORE UPDATE ON vault_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER entities_set_updated_at
  BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Snapshot title+content before update (migration 004)
CREATE OR REPLACE FUNCTION create_item_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.title != NEW.title OR OLD.content != NEW.content) THEN
    INSERT INTO item_versions (item_id, title, content) VALUES (OLD.id, OLD.title, OLD.content);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER items_create_version
  BEFORE UPDATE ON items FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION create_item_version();
