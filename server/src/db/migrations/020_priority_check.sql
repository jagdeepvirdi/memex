-- Enforce priority values at the DB level (defence in depth; the API already validates with zod).
-- NULL stays valid (= not triaged yet). Idempotent: skipped if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_priority_check'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_priority_check
      CHECK (priority IS NULL OR priority IN ('essential', 'useful', 'skip'));
  END IF;
END $$;
