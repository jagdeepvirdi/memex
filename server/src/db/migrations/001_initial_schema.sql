-- Migration 001 — initial schema
-- Creates all tables, indexes, triggers, and enums from scratch.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE item_type AS ENUM (
  'note', 'recipe', 'media', 'spec', 'stock', 'password', 'link', 'book'
);

CREATE TYPE item_source AS ENUM (
  'keep', 'manual', 'url', 'youtube', 'instagram'
);

-- Categories (hierarchical self-referential tree)
CREATE TABLE categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX categories_root_uniq
  ON categories (name) WHERE parent_id IS NULL;

CREATE UNIQUE INDEX categories_child_uniq
  ON categories (name, parent_id) WHERE parent_id IS NOT NULL;

-- Items
CREATE TABLE items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  type          item_type   NOT NULL DEFAULT 'note',
  content       TEXT        NOT NULL DEFAULT '',
  structured    JSONB       NOT NULL DEFAULT '{}',
  source        item_source NOT NULL DEFAULT 'manual',
  source_url    TEXT,
  content_hash  TEXT,
  embedding     vector(768),
  encrypted     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index — fast approximate nearest-neighbour cosine search
CREATE INDEX items_embedding_hnsw
  ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX items_fts
  ON items USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  );

CREATE INDEX items_content_hash_idx ON items (content_hash);
CREATE INDEX items_type_idx         ON items (type);
CREATE INDEX items_created_at_idx   ON items (created_at DESC);

-- Item–Category junction
CREATE TABLE item_categories (
  item_id      UUID NOT NULL REFERENCES items(id)      ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, category_id)
);

-- Tags
CREATE TABLE tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE
);

-- Item–Tag junction
CREATE TABLE item_tags (
  item_id  UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- Vault items (plaintext never stored — AES-256-GCM encrypted client-side)
CREATE TABLE vault_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service     TEXT        NOT NULL,
  url         TEXT,
  username    TEXT,
  ciphertext  TEXT        NOT NULL,
  iv          TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vault config — one row, stores PBKDF2 salt (not a secret)
CREATE TABLE vault_config (
  id    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  salt  TEXT    NOT NULL
);

-- Users (single-user auth — bcrypt + JWT)
CREATE TABLE users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        NOT NULL UNIQUE,
  password_hash  TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at trigger
CREATE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_set_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER vault_items_set_updated_at
  BEFORE UPDATE ON vault_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
