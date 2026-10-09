-- UPPS v1 PostgreSQL schema
CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  free_fire_uid TEXT UNIQUE,
  email TEXT UNIQUE,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','BANNED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OWNER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id BIGSERIAL PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('SOLO','DUO','SQUAD')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('FREE','PAID')),
  entry_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  matches_count INTEGER NOT NULL DEFAULT 1 CHECK (matches_count > 0),
  scoring_type TEXT NOT NULL DEFAULT 'CUSTOM',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  start_at TIMESTAMPTZ,
  registration_close_at TIMESTAMPTZ,
  room_id TEXT,
  room_password TEXT,
  rules TEXT NOT NULL DEFAULT '',
  prize_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrations (
  id BIGSERIAL PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAYMENT_PENDING','VERIFIED','REJECTED','WAITLISTED','CANCELLED')),
  payment_id TEXT UNIQUE,
  utr TEXT,
  team_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  UNIQUE(tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  room_id TEXT,
  room_password TEXT,
  room_release_at TIMESTAMPTZ,
  room_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  start_at TIMESTAMPTZ,
  UNIQUE(tournament_id, match_number)
);

-- Safe migrations for databases created by earlier UPPS versions.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS room_release_at TIMESTAMPTZ;
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS room_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS results (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  placement INTEGER NOT NULL CHECK (placement > 0),
  kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  points NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(match_id, player_id),
  UNIQUE(match_id, placement)
);

CREATE TABLE IF NOT EXISTS prizes (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  position_label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  winner_player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  payout_status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id BIGINT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_tournament ON registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_reg_player ON registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_results_player ON results(player_id);
CREATE INDEX IF NOT EXISTS idx_results_match ON results(match_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tournament ON reviews(tournament_id);
