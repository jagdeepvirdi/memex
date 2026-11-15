-- User-supplied API keys (Claude, Gemini, YouTube Data API), entered in Settings.
-- Keys are stored ENCRYPTED (AES-256-GCM, see services/apiKeys.ts) in their own table — never in
-- `settings`, which GET /api/settings returns wholesale. No endpoint ever returns a key; the UI only
-- sees whether one is configured and its last four characters. Env vars take priority over these.
CREATE TABLE IF NOT EXISTS api_keys (
  provider    TEXT        PRIMARY KEY CHECK (provider IN ('claude', 'gemini', 'youtube')),
  ciphertext  TEXT        NOT NULL,   -- base64(ciphertext || GCM auth tag)
  iv          TEXT        NOT NULL,   -- base64 12-byte nonce
  last4       TEXT        NOT NULL,   -- shown in the UI so you can tell which key is saved
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
