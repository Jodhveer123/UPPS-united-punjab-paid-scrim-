-- Run this ONLY against the Vercel-connected Neon database.
-- It is safe to run more than once.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS room_release_at TIMESTAMPTZ;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS room_enabled BOOLEAN NOT NULL DEFAULT FALSE;
