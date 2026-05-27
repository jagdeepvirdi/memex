-- Memex — canonical schema reference
-- Applied via migrations/001_initial_schema.sql
-- Run: npm run migrate

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), crypt()

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE item_type AS ENUM (
  'note', 'recipe', 'media', 'spec', 'stock', 'password', 'link', 'book'
);

CREATE TYPE item_source AS ENUM (
  'keep', 'manual', 'url', 'youtube', 'instagram'
);

-- ── Categories (hierarchical tree) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Root categories: unique by name where parent_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS categories_root_uniq
  ON categories (name) WHERE parent_id IS NULL;

-- Child categories: unique by (name, parent_id)
CREATE UNIQUE INDEX IF NOT EXISTS categories_child_uniq
  ON categories (name, parent_id) WHERE parent_id IS NOT NULL;

-- ── Items ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  type          item_type   NOT NULL DEFAULT 'note',
  content       TEXT        NOT NULL DEFAULT '',
  structured    JSONB       NOT NULL DEFAULT '{}',
  source        item_source NOT NULL DEFAULT 'manual',
  source_url    TEXT,
  content_hash  TEXT,                       -- MD5 for Keep import deduplication
  embedding     vector(768),                -- nomic-embed-text (768 dims)
  encrypted     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast cosine-similarity search (pgvector)
CREATE INDEX IF NOT EXISTS items_embedding_hnsw
  ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search (hybrid with semantic)
CREATE INDEX IF NOT EXISTS items_fts
  ON items USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  );

CREATE INDEX IF NOT EXISTS items_content_hash_idx ON items (content_hash);
CREATE INDEX IF NOT EXISTS items_type_idx ON items (type);
CREATE INDEX IF NOT EXISTS items_created_at_idx ON items (created_at DESC);

-- ── Item–Category junction ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_categories (
  item_id      UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, category_id)
);

-- ── Tags ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE
);

-- ── Item–Tag junction ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_tags (
  item_id  UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- ── Password Vault ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service     TEXT        NOT NULL,
  url         TEXT,
  username    TEXT,
  -- AES-256-GCM encrypted fields — plaintext never stored on server
  ciphertext  TEXT        NOT NULL,  -- base64 encoded ciphertext
  iv          TEXT        NOT NULL,  -- base64 encoded 12-byte IV
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-row vault config — PBKDF2 salt (not secret, just random per install)
CREATE TABLE IF NOT EXISTS vault_config (
  id    INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt  TEXT        NOT NULL   -- base64 encoded 32-byte random salt
);

-- ── Auth (single-user) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        NOT NULL UNIQUE,
  password_hash  TEXT        NOT NULL,    -- bcrypt
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER items_set_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER vault_items_set_updated_at
  BEFORE UPDATE ON vault_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
