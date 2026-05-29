-- Migration 010 — add 'place' to item_type enum
-- 'place' was added to the TypeScript types in Phase 2 but never applied to the DB enum.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction, so no BEGIN/COMMIT needed here.

ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'place';
