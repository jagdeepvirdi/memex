-- Migration 011 — Reminders
-- remind_at: when the user wants to be notified about this item.
-- Cleared to NULL automatically after the notification fires.

ALTER TABLE items ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS items_remind_at_idx
  ON items (remind_at)
  WHERE remind_at IS NOT NULL;
