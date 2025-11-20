-- ============================================================================
-- AI-GUIDED ADAPTIVE PLAYLIST BUILDER - DATABASE SCHEMA
-- Multi-user architecture with shared song features
-- ============================================================================

-- ============================================================================
-- SHARED SONG FEATURES (used by all users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS song_features (
  video_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  release_year INTEGER,

  -- MUSIC dimensions (0-35 scale)
  mellow INTEGER DEFAULT 17 CHECK (mellow BETWEEN 0 AND 35),
  sophisticated INTEGER DEFAULT 17 CHECK (sophisticated BETWEEN 0 AND 35),
  intense INTEGER DEFAULT 17 CHECK (intense BETWEEN 0 AND 35),
  contemporary INTEGER DEFAULT 17 CHECK (contemporary BETWEEN 0 AND 35),
  unpretentious INTEGER DEFAULT 17 CHECK (unpretentious BETWEEN 0 AND 35),

  -- Musical features
  tempo_bpm INTEGER,
  tempo_normalized INTEGER CHECK (tempo_normalized BETWEEN 0 AND 35),
  energy REAL CHECK (energy BETWEEN 0 AND 1),
  complexity REAL CHECK (complexity BETWEEN 0 AND 1),
  mode INTEGER CHECK (mode BETWEEN 0 AND 35),
  predictability INTEGER CHECK (predictability BETWEEN 0 AND 35),
  consonance INTEGER CHECK (consonance BETWEEN 0 AND 35),
  valence INTEGER CHECK (valence BETWEEN 0 AND 35),
  arousal INTEGER CHECK (arousal BETWEEN 0 AND 35),

  -- Metadata
  genres JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  popularity REAL DEFAULT 0.5 CHECK (popularity BETWEEN 0 AND 1),
  is_mainstream BOOLEAN DEFAULT false,
  has_lyrics BOOLEAN DEFAULT true,

  -- Analysis tracking
  analysis_source TEXT, -- 'musicbrainz', 'proxy', 'manual'
  analysis_confidence REAL DEFAULT 0.5,
  analysis_version INTEGER DEFAULT 1,

  -- Access tracking (for cleanup)
  first_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0
);

-- Indexes for multi-user queries
CREATE INDEX IF NOT EXISTS idx_song_genres ON song_features USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_song_tags ON song_features USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_song_year ON song_features(release_year);
CREATE INDEX IF NOT EXISTS idx_song_tempo ON song_features(tempo_normalized);
CREATE INDEX IF NOT EXISTS idx_song_energy ON song_features(energy);
CREATE INDEX IF NOT EXISTS idx_song_dimensions ON song_features(mellow, sophisticated, intense, contemporary, unpretentious);
CREATE INDEX IF NOT EXISTS idx_song_popularity ON song_features(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_song_last_accessed ON song_features(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_song_hot ON song_features(access_count DESC) WHERE access_count > 10;

-- ============================================================================
-- USER-SPECIFIC TABLES
-- ============================================================================

-- User listening history
CREATE TABLE IF NOT EXISTS user_listening_history (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,

  -- Listening metrics
  play_count INTEGER DEFAULT 1,
  completion_rate REAL CHECK (completion_rate BETWEEN 0 AND 1),
  last_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  first_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- User actions
  added_to_library BOOLEAN DEFAULT FALSE,
  explicit_rating INTEGER CHECK (explicit_rating IN (-1, 0, 1)),

  -- Foreign key (may be null if features not yet extracted)
  FOREIGN KEY (video_id) REFERENCES song_features(video_id) ON DELETE SET NULL,

  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_user_history_user ON user_listening_history(user_id, last_played_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_history_video ON user_listening_history(video_id);
CREATE INDEX IF NOT EXISTS idx_user_history_recent ON user_listening_history(user_id, first_played_at DESC);

-- Materialized view for user statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS user_listening_stats AS
SELECT
  user_id,
  COUNT(*) as total_tracks_played,
  SUM(play_count) as total_plays,
  AVG(completion_rate) as avg_completion_rate,
  COUNT(*) FILTER (WHERE added_to_library) as library_size,
  MAX(last_played_at) as last_active
FROM user_listening_history
GROUP BY user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_stats ON user_listening_stats(user_id);

-- User profiles with cached data
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,

  -- Latest encoded profile
  current_profile_code TEXT,

  -- Cached computed data
  familiar_styles JSONB, -- {genres: [], tags: [], dimensions: {}}
  average_features JSONB, -- {tempo: N, complexity: N, etc.}
  sophistication_level REAL,
  novelty_tolerance REAL,
  personality_indicators JSONB,

  -- Cache metadata
  profile_version INTEGER DEFAULT 1,
  cache_valid_until TIMESTAMP,
  last_computed_at TIMESTAMP,
  computation_duration_ms INTEGER,

  -- User metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_playlists_created INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_active ON user_profiles(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_cache_valid ON user_profiles(cache_valid_until);

-- Conversation sessions
CREATE TABLE IF NOT EXISTS conversation_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Session data
  profile_partial JSONB,
  conversation_history JSONB,
  questions_asked INTEGER DEFAULT 0,
  confidence INTEGER DEFAULT 0,
  ai_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed BOOLEAN DEFAULT FALSE,

  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_user ON conversation_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_expires ON conversation_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_active ON conversation_sessions(last_activity_at)
  WHERE NOT completed;

-- Playlists
CREATE TABLE IF NOT EXISTS playlists (
  playlist_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Playlist metadata
  name TEXT NOT NULL,
  description TEXT,
  profile_code TEXT NOT NULL,

  -- Stats
  track_count INTEGER DEFAULT 0,
  total_plays INTEGER DEFAULT 0,
  avg_skip_rate REAL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_played_at TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playlist_user ON playlists(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_code ON playlists(profile_code);
CREATE INDEX IF NOT EXISTS idx_playlist_recent ON playlists(created_at DESC);

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- Cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM conversation_sessions
  WHERE expires_at < NOW() AND NOT completed;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup stale song features
CREATE OR REPLACE FUNCTION cleanup_stale_songs(days_threshold INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM song_features
  WHERE last_accessed_at < NOW() - (days_threshold || ' days')::INTERVAL
  AND access_count < 5;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Update song access tracking
CREATE OR REPLACE FUNCTION update_song_access(vid TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE song_features
  SET
    last_accessed_at = CURRENT_TIMESTAMP,
    access_count = access_count + 1
  WHERE video_id = vid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA SETUP
-- ============================================================================

-- Insert system user for testing (optional)
INSERT INTO user_profiles (user_id, created_at)
VALUES ('system', CURRENT_TIMESTAMP)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- SCHEMA VERSION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);

INSERT INTO schema_versions (version, description)
VALUES (1, 'Initial adaptive playlist schema')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- GRANTS (adjust as needed for your setup)
-- ============================================================================

-- If using a specific database user, grant permissions here
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_db_user;
