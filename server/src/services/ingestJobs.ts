import { pool } from '../db/client.js'

// DB-backed job helpers so progress survives server restarts.
// Shared by Keep import, reprocess and the YouTube backfill.

export async function createJob(id: string, total: number, kind: string | null = null): Promise<void> {
  await pool.query(
    `INSERT INTO ingest_jobs (id, status, progress, total, completed, kind)
     VALUES ($1, 'processing', 0, $2, 0, $3)`,
    [id, total, kind],
  )
}

export async function updateJobProgress(id: string, completed: number, total: number): Promise<void> {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 100
  await pool.query('UPDATE ingest_jobs SET completed=$1, progress=$2 WHERE id=$3', [completed, progress, id])
}

/**
 * Progress for jobs whose size is only known once they start (e.g. an explanation, where the number of parts
 * depends on the source). Updates the total, the percentage and the details in one write.
 */
export async function reportJobProgress(id: string, completed: number, total: number, details?: unknown): Promise<void> {
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 100
  await pool.query(
    'UPDATE ingest_jobs SET completed=$1, total=$2, progress=$3, details=COALESCE($4::jsonb, details) WHERE id=$5',
    [completed, total, progress, details === undefined ? null : JSON.stringify(details), id],
  )
}

/** Marks a job finished. Call once, after every task has settled — never from inside a task. */
export async function completeJob(id: string, details?: unknown): Promise<void> {
  await pool.query(
    "UPDATE ingest_jobs SET status='completed', progress=100, completed_at=NOW(), details=COALESCE($2::jsonb, details) WHERE id=$1",
    [id, details === undefined ? null : JSON.stringify(details)],
  )
}

export async function failJob(id: string, error: string, details?: unknown): Promise<void> {
  await pool.query(
    "UPDATE ingest_jobs SET status='failed', error=$2, completed_at=NOW(), details=COALESCE($3::jsonb, details) WHERE id=$1",
    [id, error, details === undefined ? null : JSON.stringify(details)],
  )
}

/**
 * Marks a job as stopped by the user. Only a job that is still processing changes (a job that already finished keeps
 * its outcome), so cancelling twice, or racing a job that is just completing, is harmless. Returns whether it changed.
 */
export async function cancelJob(id: string, details?: unknown): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE ingest_jobs SET status='cancelled', completed_at=NOW(), details=COALESCE($2::jsonb, details) WHERE id=$1 AND status='processing'",
    [id, details === undefined ? null : JSON.stringify(details)],
  )
  return (rowCount ?? 0) > 0
}

/** Stores the running per-item results without finishing the job (so a poll can show them). */
export async function saveJobDetails(id: string, details: unknown): Promise<void> {
  await pool.query('UPDATE ingest_jobs SET details=$2::jsonb WHERE id=$1', [id, JSON.stringify(details)])
}

/** True if a job of this kind is still processing (and was started recently — stale rows from a crash are ignored). */
export async function hasRunningJob(kind: string, staleAfterMinutes = 180): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM ingest_jobs
     WHERE kind=$1 AND status='processing' AND started_at > NOW() - ($2 || ' minutes')::interval
     LIMIT 1`,
    [kind, String(staleAfterMinutes)],
  )
  return rows.length > 0
}
