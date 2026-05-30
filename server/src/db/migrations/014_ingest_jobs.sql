-- Migration 014 — Persistent ingest job tracking
-- Replaces the in-memory jobs object so job state survives server restarts.

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id          UUID        PRIMARY KEY,
  status      TEXT        NOT NULL DEFAULT 'processing',
  progress    INTEGER     NOT NULL DEFAULT 0,
  total       INTEGER     NOT NULL DEFAULT 0,
  completed   INTEGER     NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS ingest_jobs_status_idx ON ingest_jobs (status);
