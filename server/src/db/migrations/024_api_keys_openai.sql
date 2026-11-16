-- Allow an OpenAI (ChatGPT) key in `api_keys`. Migration 023 restricted `provider` to claude/gemini/youtube,
-- so saving an OpenAI key from Settings would violate that CHECK. Idempotent: safe to run more than once.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_provider_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_provider_check CHECK (provider IN ('claude', 'gemini', 'openai', 'youtube'));
