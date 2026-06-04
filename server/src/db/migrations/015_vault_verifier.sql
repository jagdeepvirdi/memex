-- Migration 015: add verifier columns to vault_config
-- Stores an AES-256-GCM encrypted sentinel so the client can verify
-- the vault password is correct before unlocking (prevents silent wrong-key decryption).
ALTER TABLE vault_config
  ADD COLUMN IF NOT EXISTS verifier     TEXT,
  ADD COLUMN IF NOT EXISTS verifier_iv  TEXT;
