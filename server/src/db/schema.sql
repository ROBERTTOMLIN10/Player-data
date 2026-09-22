-- FAU Men's Soccer Performance Dashboard
-- Core schema. Designed so Phase 2 (readiness/RPE) and Phase 3 (minutes played)
-- tables join cleanly on player_id + date/game_id without reworking Phase 1 tables.

PRAGMA foreign_keys = ON;

-- One row per real human player. All metrics ultimately point here.
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every spelling/formatting variant of a player's name seen in source files
-- maps to one canonical player. normalized_alias is lowercased/trimmed/punctuation-stripped.
CREATE TABLE IF NOT EXISTS player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  normalized_alias TEXT NOT NULL UNIQUE,
  raw_alias TEXT NOT NULL
);

-- One row per game. game_date comes from the Titan file's own date column
-- (authoritative); opponent comes from the filename convention
-- "YYYY-MM-DD_Opponent.xlsx" and can be edited later if needed.
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_date TEXT NOT NULL,
  opponent TEXT,
  source_file TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per player per game: the core Titan GPS metrics as typed columns
-- for fast querying/charting. raw_json preserves the full original row
-- (including any columns we don't explicitly recognize) so nothing is lost
-- if Titan adds fields later.
CREATE TABLE IF NOT EXISTS gps_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  distance_mi REAL,
  active_time_min REAL,
  load REAL,
  top_speed_mph REAL,
  peak_accel REAL,
  peak_decel REAL,
  sprints_count REAL,
  sprints_max_topspeed_mph REAL,
  sprints_avg_topspeed_mph REAL,
  sprints_distance_yd REAL,
  sprints_volume REAL,
  explosiveness_count REAL,
  explosiveness_mean_accel REAL,
  raw_json TEXT NOT NULL,
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_gps_sessions_player ON gps_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_gps_sessions_game ON gps_sessions(game_id);

-- Normalized zone breakdowns (speed zones, speed bands, accel/decel zones).
-- Kept separate from gps_sessions because the number and thresholds of zones
-- can change between seasons/Titan configs; this avoids a schema migration
-- every time a zone is added, removed, or relabeled.
CREATE TABLE IF NOT EXISTS gps_zone_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gps_session_id INTEGER NOT NULL REFERENCES gps_sessions(id) ON DELETE CASCADE,
  zone_group TEXT NOT NULL, -- speed_zone_duration | speed_zone_distance | speed_band_duration | speed_band_distance | speed_band_personal_duration | speed_band_personal_distance | accel_zone | decel_zone
  zone_label TEXT NOT NULL, -- e.g. '2m/s', 'Band1', '-3m/s/s'
  value REAL,
  unit TEXT -- min | mi | count
);

CREATE INDEX IF NOT EXISTS idx_gps_zone_metrics_session ON gps_zone_metrics(gps_session_id);

-- ---------------------------------------------------------------------------
-- Phase 2 (reserved, not yet populated): pre-session readiness + post-session RPE
-- from Google Sheets. entry_date is the training/game date, joins to players
-- via player_id and to games via games.game_date when the date is a game day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS readiness_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,
  readiness_score INTEGER,
  notes TEXT,
  source_row_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, entry_date, source_row_ref)
);

CREATE TABLE IF NOT EXISTS rpe_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,
  rpe_score INTEGER, -- NULL when blank or "X" (did not train)
  did_not_train INTEGER NOT NULL DEFAULT 0,
  source_row_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, entry_date, source_row_ref)
);

-- ---------------------------------------------------------------------------
-- Phase 3 (reserved, not yet populated): per-player minutes played, scraped
-- from Sidearm box score pages. Joins to gps_sessions via (game_id, player_id)
-- to compute load-per-minute etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS minutes_played (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  minutes REAL,
  started INTEGER,
  position TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Schedule + game stats: the full season schedule scraped from fausports.com
-- (past AND future games — future games simply have NULL result/score fields
-- until they're played), plus full per-player and per-team box score stats
-- for completed games. Deliberately independent of `games`/`gps_sessions`
-- (which only exist for games we have a Titan GPS export for) so the schedule
-- and results can show a full season even for games with no GPS file.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_date TEXT NOT NULL, -- YYYY-MM-DD
  game_time TEXT, -- e.g. "7 p.m." (free text from Sidearm, kickoff local time)
  opponent TEXT NOT NULL,
  opponent_logo_url TEXT,
  location TEXT,
  home_away TEXT, -- 'H' | 'A' | 'N'
  is_conference INTEGER NOT NULL DEFAULT 0,
  status TEXT, -- 'W' | 'L' | 'T' | NULL (not yet played)
  team_score INTEGER,
  opponent_score INTEGER,
  boxscore_url TEXT,
  recap_url TEXT,
  raw_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game_date, opponent)
);

CREATE INDEX IF NOT EXISTS idx_schedule_games_date ON schedule_games(game_date);

-- One row per FAU player per completed schedule game: full box score stats.
-- points = goals*2 + assists (NCAA soccer convention, verified against live data).
CREATE TABLE IF NOT EXISTS player_game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_game_id INTEGER NOT NULL REFERENCES schedule_games(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  minutes REAL,
  started INTEGER NOT NULL DEFAULT 0,
  position TEXT,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  shots INTEGER NOT NULL DEFAULT 0,
  shots_on_goal INTEGER NOT NULL DEFAULT 0,
  fouls INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  is_goalie INTEGER NOT NULL DEFAULT 0,
  saves INTEGER,
  goals_allowed INTEGER,
  shutout INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(schedule_game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_game_stats_player ON player_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game ON player_game_stats(schedule_game_id);

-- Team-level totals for both sides of a completed schedule game (FAU + opponent),
-- for the team stats page's game-by-game box scores.
CREATE TABLE IF NOT EXISTS game_team_totals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_game_id INTEGER NOT NULL REFERENCES schedule_games(id) ON DELETE CASCADE,
  side TEXT NOT NULL, -- 'FAU' | 'opponent'
  team_name TEXT,
  goals INTEGER,
  assists INTEGER,
  points INTEGER,
  shots INTEGER,
  shots_on_goal INTEGER,
  saves INTEGER,
  corners INTEGER,
  fouls INTEGER,
  offsides INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER,
  raw_json TEXT,
  UNIQUE(schedule_game_id, side)
);

-- ---------------------------------------------------------------------------
-- Logins. Coaches see everything; players see only their own data (plus
-- anonymized squad GPS for context). Players sign in once with their email and
-- stay signed in on that device via a long-lived session cookie.
-- The ADMIN_USER/ADMIN_PASSWORD env pair always works as a coach login too, so
-- there's no way to lock yourself out.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, -- scrypt: "salt:hash" (hex)
  role TEXT NOT NULL CHECK (role IN ('coach', 'player')),
  player_id INTEGER UNIQUE REFERENCES players(id) ON DELETE CASCADE, -- required for role = 'player'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- token_hash is sha256 of the cookie value, so a leaked DB can't be replayed as
-- logins. user_id is NULL for the env-var coach login (no users row).
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Daily pre-session readiness check-in, submitted by the player in the app.
-- One per player per day (re-submitting the same day edits it). entry_date is
-- the team's local date (TEAM_TIMEZONE), not UTC. Wellness items are 1–5 where
-- 5 is always the good end (e.g. stress 5 = very relaxed, soreness 5 = none),
-- so readiness_score = sum / 25 as a 0–100 percentage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS readiness_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL, -- YYYY-MM-DD
  is_game_day INTEGER NOT NULL DEFAULT 0,
  sleep_hours REAL,
  sleep_quality INTEGER NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
  muscle_soreness INTEGER NOT NULL CHECK (muscle_soreness BETWEEN 1 AND 5),
  stress INTEGER NOT NULL CHECK (stress BETWEEN 1 AND 5),
  mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  readiness_score INTEGER NOT NULL,
  notes TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_readiness_checkins_date ON readiness_checkins(entry_date);

-- Body-map selections for a check-in: one row per sore/bothered region.
-- region ids match server/src/lib/bodyRegions.ts (e.g. 'quad_l').
CREATE TABLE IF NOT EXISTS readiness_soreness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_id INTEGER NOT NULL REFERENCES readiness_checkins(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('light', 'moderate', 'severe')),
  note TEXT,
  UNIQUE(checkin_id, region)
);
