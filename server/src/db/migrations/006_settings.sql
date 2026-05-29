-- Migration 006 — System Settings
-- Stores global configuration like the active AI model.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default values
INSERT INTO settings (key, value) VALUES 
  ('ai_model', '"llama3.2"'),
  ('use_claude', 'false'),
  ('auto_lock_timeout', '15'),
  ('strict_local_mode', 'false')
ON CONFLICT (key) DO NOTHING;
