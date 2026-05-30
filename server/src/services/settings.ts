import { pool } from '../db/client.js';
import logger from '../lib/logger.js'

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length === 0) return defaultValue;
    return rows[0].value as T;
  } catch (error) {
    logger.error(error, `Failed to fetch setting ${key}`)
    return defaultValue;
  }
}

export async function getAiConfig() {
  const model = await getSetting('ai_model', 'llama3.2');
  const useClaude = await getSetting('use_claude', false);
  return { model, useClaude };
}
