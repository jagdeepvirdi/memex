-- Add type column to vault_items to distinguish password credentials from migrated notes
ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'credential';
