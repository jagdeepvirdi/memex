// The local embedding model name, shared by the Ollama client and the embedding bookkeeping so the two cannot drift.
export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'
