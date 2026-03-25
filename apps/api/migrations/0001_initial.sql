CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  guest_token TEXT NOT NULL UNIQUE,
  guest_token_hash TEXT NOT NULL UNIQUE,
  admin_token_hash TEXT NOT NULL UNIQUE,
  uploads_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  nickname TEXT,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  uploader_session_id TEXT,
  uploader_nickname_snapshot TEXT,
  filter_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(uploader_session_id) REFERENCES guest_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_events_guest_token_hash ON events(guest_token_hash);
CREATE INDEX IF NOT EXISTS idx_events_admin_token_hash ON events(admin_token_hash);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_event_id ON guest_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_event_id_created_at ON photos(event_id, created_at DESC);
