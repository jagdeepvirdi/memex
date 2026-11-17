-- Record which model produced each stored vector. Until now every vector came from Ollama's nomic-embed-text, so
-- nothing needed to say so. With a second embedding model two 768-dim vectors would compare without any error and
-- give wrong results, so every similarity query now filters to the active model.
--   items.embedding_model   '<provider>:<model>' that made `embedding` (NULL when there is no vector)
--   items.embedding_skip    why a vector was deliberately not made ('private' = not allowed to leave this machine)
--   entities.embedding_model  same as items
-- Idempotent: safe to run more than once.
ALTER TABLE items    ADD COLUMN IF NOT EXISTS embedding_model TEXT;
ALTER TABLE items    ADD COLUMN IF NOT EXISTS embedding_skip  TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- Every existing vector was made by the default local model.
UPDATE items    SET embedding_model = 'ollama:nomic-embed-text' WHERE embedding IS NOT NULL AND embedding_model IS NULL;
UPDATE entities SET embedding_model = 'ollama:nomic-embed-text' WHERE embedding IS NOT NULL AND embedding_model IS NULL;
