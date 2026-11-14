-- Ingest jobs: per-item results and a job kind.
-- `details` holds a per-item result list (applied / skipped / failed + reason) for jobs
-- that need more than a single error string, e.g. the YouTube backfill.
-- `kind` lets a job type enforce "only one running at a time".
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE ingest_jobs ADD COLUMN IF NOT EXISTS details JSONB;
