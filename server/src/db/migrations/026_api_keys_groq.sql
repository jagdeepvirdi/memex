-- Allow a Groq key in `api_keys`. Migration 024 restricted `provider` to claude/gemini/openai/youtube, so saving a Groq
-- key from Settings would violate that CHECK. Idempotent: safe to run more than once.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_provider_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_provider_check CHECK (provider IN ('claude', 'gemini', 'openai', 'groq', 'youtube'));
