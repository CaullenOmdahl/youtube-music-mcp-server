# AI-Guided Adaptive Playlist Builder
## Complete Implementation Guide

---

## Overview

This guide walks you through implementing the AI-Guided Adaptive Playlist Builder for your YouTube Music MCP server, replacing the current 8 smart playlist tools with 5 intuitive conversation-based tools.

**Time Estimate**: 2-3 weeks (part-time development)

**Prerequisites**:
- Existing YouTube Music MCP server running
- Railway deployment with PostgreSQL
- Node.js 18+ and TypeScript
- Basic SQL knowledge

**What You'll Build**:
- Adaptive AI interviewer that learns user preferences
- Research-backed recommendation scoring (70-20-10 tier system)
- Multi-user database architecture
- 5 new MCP tools replacing 8 old ones

---

## Table of Contents

1. [Phase 1: Project Setup & Dependencies](#phase-1-project-setup--dependencies)
2. [Phase 2: Database Schema & Migration](#phase-2-database-schema--migration)
3. [Phase 3: Core Types & Interfaces](#phase-3-core-types--interfaces)
4. [Phase 4: Profile Encoding System](#phase-4-profile-encoding-system)
5. [Phase 5: Song Feature Extraction](#phase-5-song-feature-extraction)
6. [Phase 6: Scoring Engine](#phase-6-scoring-engine)
7. [Phase 7: Recommendation Engine](#phase-7-recommendation-engine)
8. [Phase 8: Session Management](#phase-8-session-management)
9. [Phase 9: MCP Tool Integration](#phase-9-mcp-tool-integration)
10. [Phase 10: Testing & Validation](#phase-10-testing--validation)
11. [Phase 11: Deployment to Railway](#phase-11-deployment-to-railway)
12. [Phase 12: Migration & Cleanup](#phase-12-migration--cleanup)

---

## Phase 1: Project Setup & Dependencies

### 1.1 Install New Dependencies

```bash
cd youtube-music-mcp-server

# Core dependencies
npm install pg          # PostgreSQL client
npm install lru-cache   # In-memory caching
npm install node-cron   # Background jobs

# Development dependencies
npm install -D @types/pg @types/node-cron

# Optional: Redis for production caching
npm install redis
npm install -D @types/redis
```

### 1.2 Update package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx src/server.ts",
    "build": "tsc && npm run migrate",
    "migrate": "node dist/database/migrate.js",
    "test": "jest",
    "test:integration": "jest --config jest.integration.config.js",
    "clean": "rm -rf dist"
  }
}
```

### 1.3 Create Directory Structure

```bash
mkdir -p src/adaptive-playlist/scoring
mkdir -p src/adaptive-playlist/utils
mkdir -p src/database
mkdir -p src/cache
mkdir -p src/jobs
mkdir -p tests/adaptive-playlist
mkdir -p tests/integration
```

Your structure should look like:
```
youtube-music-mcp-server/
├── src/
│   ├── adaptive-playlist/
│   │   ├── types.ts
│   │   ├── encoder.ts
│   │   ├── recommendation-engine.ts
│   │   ├── session-manager.ts
│   │   ├── song-features.ts
│   │   ├── profile-storage.ts
│   │   ├── scoring/
│   │   │   ├── index.ts
│   │   │   ├── primary.ts
│   │   │   ├── secondary.ts
│   │   │   ├── tertiary.ts
│   │   │   └── modulation.ts
│   │   ├── utils/
│   │   │   └── helpers.ts
│   │   └── AI-KNOWLEDGE.md
│   ├── database/
│   │   ├── client.ts
│   │   ├── schema.sql
│   │   └── migrate.ts
│   ├── cache/
│   │   └── memory.ts
│   ├── jobs/
│   │   └── maintenance.ts
│   └── tools/
│       └── adaptive-playlist.ts
├── tests/
│   ├── adaptive-playlist/
│   │   ├── encoder.test.ts
│   │   ├── scoring.test.ts
│   │   └── song-features.test.ts
│   └── integration/
│       └── end-to-end.test.ts
└── package.json
```

---

## Phase 2: Database Schema & Migration

### 2.1 Create Database Schema

Create `src/database/schema.sql`:

```sql
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
CREATE INDEX IF NOT EXISTS idx_user_history_recent ON user_listening_history(user_id, first_played_at DESC)
  WHERE first_played_at > CURRENT_TIMESTAMP - INTERVAL '30 days';

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
CREATE INDEX IF NOT EXISTS idx_user_cache_valid ON user_profiles(cache_valid_until) 
  WHERE cache_valid_until < CURRENT_TIMESTAMP;

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
CREATE INDEX IF NOT EXISTS idx_playlist_recent ON playlists(created_at DESC) 
  WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days';

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
```

### 2.2 Create Database Client

Create `src/database/client.ts`:

```typescript
import { Pool, PoolClient } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production';
const maxConnections = parseInt(process.env.DATABASE_POOL_MAX || '20');
const minConnections = parseInt(process.env.DATABASE_POOL_MIN || '5');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  
  // Pool settings
  min: minConnections,
  max: maxConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10s max per query
  
  // Keep-alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  
  application_name: 'youtube-music-mcp'
});

// Event handlers
pool.on('connect', () => {
  console.log('🔌 New database connection established');
});

pool.on('acquire', () => {
  const activeConnections = pool.totalCount;
  const waitingClients = pool.waitingCount;
  
  if (waitingClients > 5) {
    console.warn(`⚠️  High connection wait queue: ${waitingClients} clients waiting`);
  }
  
  if (activeConnections > maxConnections * 0.8) {
    console.warn(`⚠️  Connection pool near capacity: ${activeConnections}/${maxConnections}`);
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Draining database connection pool...');
  await pool.end();
  process.exit(0);
});

// Initialize database (run migrations)
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('🔄 Initializing database...');
    
    const client = await pool.connect();
    
    try {
      // Read schema file
      const schemaPath = join(__dirname, 'schema.sql');
      const schemaSql = readFileSync(schemaPath, 'utf-8');
      
      // Execute schema
      await client.query(schemaSql);
      
      console.log('✅ Database schema initialized');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
}> {
  return {
    healthy: pool.totalCount > 0,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount
  };
}

// Query wrapper with logging
export const db = {
  query: async (text: string, params?: any[]) => {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`🐌 Slow query (${duration}ms):`, text.substring(0, 100));
      }
      
      return result;
    } catch (error) {
      console.error('❌ Query error:', error);
      throw error;
    }
  },
  
  getClient: (): Promise<PoolClient> => pool.connect()
};

export default db;
```

### 2.3 Create Migration Script

Create `src/database/migrate.ts`:

```typescript
import { initializeDatabase } from './client.js';

async function migrate() {
  try {
    console.log('🚀 Starting database migration...');
    
    await initializeDatabase();
    
    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

export default migrate;
```

### 2.4 Add Railway PostgreSQL

1. Go to your Railway project dashboard
2. Click "New" → "Database" → "Add PostgreSQL"
3. Railway will automatically set `DATABASE_URL` environment variable
4. Note the connection details (available in the PostgreSQL service)

### 2.5 Test Database Connection

```bash
# Set DATABASE_URL locally for testing
export DATABASE_URL="postgresql://user:pass@localhost:5432/youtube_music"

# Run migration
npm run migrate

# Should see:
# 🚀 Starting database migration...
# 🔄 Initializing database...
# ✅ Database schema initialized
# ✅ Migration complete
```

---

## Phase 3: Core Types & Interfaces

### 3.1 Create Complete Type Definitions

Create `src/adaptive-playlist/types.ts`:

```typescript
// ============================================================================
// CORE TYPES FOR ADAPTIVE PLAYLIST SYSTEM
// ============================================================================

export interface Profile {
  version: string; // "1" for v1
  
  // Familiarity (positions 1-5)
  styleFamiliarity: number; // 0-1295
  trackExposure: number; // 0-1295
  recency: number; // 0-35
  
  // MUSIC dimensions (positions 6-10)
  dimensions: MUSICDimensions;
  
  // Musical features (positions 11-15)
  tempo: number; // 0-35
  energy?: number; // 0-1 (derived, not in encoding)
  complexity: number; // 0-35
  mode: number; // 0-35
  predictability: number; // 0-35
  consonance: number; // 0-35
  
  // Context (positions 16-19)
  activity: number; // 0-15
  timePattern: number; // 0-35
  socialFunction: number; // 0-35
  environment: number; // 0-9
  
  // Mood (positions 20-24)
  mood: MoodProfile;
  
  // Age (positions 25-26)
  age: AgeProfile;
  
  // Discovery (positions 27-28)
  discovery: DiscoveryProfile;
  
  // Sophistication (positions 29-30)
  sophistication: SophisticationProfile;
  
  // Tertiary indicators (positions 31-35)
  tertiary: TertiaryProfile;
  
  // Metadata
  lyricImportance: number; // 0-35
  confidence: number; // 0-35
  
  // Derived data (not in encoding, computed from history)
  familiarStyles?: StyleProfile;
  userId?: string;
}

export interface MUSICDimensions {
  mellow: number; // 0-35
  sophisticated: number; // 0-35
  intense: number; // 0-35
  contemporary: number; // 0-35
  unpretentious: number; // 0-35
}

export interface MoodProfile {
  valence: number; // 0-35 (negative to positive)
  arousal: number; // 0-35 (calm to energetic)
  targetValence: number; // 0-35 or -1 for unknown
  targetArousal: number; // 0-35 or -1 for unknown
  regulationStrategy: number; // 0-9
}

export interface AgeProfile {
  birthDecade: number; // 0-35
  reminiscenceEra: number; // 0-35
}

export interface DiscoveryProfile {
  stated: number; // 0-35
  behavioral: number; // 0-35 or -1 for unknown
}

export interface SophisticationProfile {
  training: number; // 0-9
  expertise: number; // 0-35
}

export interface TertiaryProfile {
  openness: number; // 0-35
  extraversion: number; // 0-35
  empathizingSystemizing: number; // 0-35
  culturalContext: number; // 0-35
}

export interface StyleProfile {
  genres: string[];
  tags: string[];
  artistIds: string[];
  dimensions: MUSICDimensions;
}

// ============================================================================
// TRACK & SONG TYPES
// ============================================================================

export interface Track {
  videoId: string;
  title: string;
  artist: string;
  releaseYear: number;
  
  // Musical features
  dimensions: MUSICDimensions;
  tempo: number; // BPM or normalized 0-35
  energy: number; // 0-1
  complexity: number; // 0-1
  mode: number; // 0-35
  predictability: number; // 0-35
  consonance: number; // 0-35
  valence: number; // 0-35
  arousal: number; // 0-35
  
  // Metadata
  genres: string[];
  tags: string[];
  popularity: number; // 0-1
  mainstream: boolean;
  isTrending: boolean;
  hasLyrics: boolean;
  
  // User-specific (populated from history)
  userPlayCount: number;
  lastPlayedDate?: Date;
  isNewArtist: boolean;
  artistFamiliarity: number; // 0-1
  
  // Computed scores (cached)
  noveltyScore?: number;
  familiarityScore?: number;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface Context {
  activity: number; // 0-15
  socialFunction: number; // 0-35
  timePattern: number; // 0-35
  environment: number; // 0-9
  moodValence: number; // 0-35
  moodArousal: number; // 0-35
  targetValence: number; // 0-35
  targetArousal: number; // 0-35
  regulationStrategy: number; // 0-9
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface ConversationSession {
  sessionId: string;
  userId: string;
  questionsAsked: number;
  confidence: number;
  createdAt: number;
  expiresAt: number;
  conversationHistory: ConversationMessage[];
  profile: Partial<Profile>;
  aiNotes?: string;
  detectedContradictions?: string[];
  completed: boolean;
}

export interface ConversationMessage {
  role: 'ai' | 'user';
  message: string;
  timestamp: number;
  extractedInfo?: Partial<Profile>;
}

// ============================================================================
// RECOMMENDATION TYPES
// ============================================================================

export interface RecommendationResult {
  track: Track;
  score: number;
  breakdown: ScoreBreakdown;
  modulation: number;
  exploration: number;
  explanation?: RecommendationExplanation;
}

export interface ScoreBreakdown {
  primary: number; // 70% weight
  secondary: number; // 20% weight
  tertiary: number; // 10% weight
  components?: {
    familiarity?: number;
    musicalFeatures?: number;
    context?: number;
    mood?: number;
    age?: number;
    discovery?: number;
    sophistication?: number;
    personality?: number;
    cognitive?: number;
    cultural?: number;
  };
}

export interface RecommendationExplanation {
  primaryReasons: string[];
  scoreBreakdown: Record<string, number>;
  matchedAttributes: string[];
  noveltyLevel: 'familiar' | 'moderate' | 'novel';
}

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface Database {
  query: (text: string, params?: any[]) => Promise<any>;
  getClient: () => Promise<any>;
}

// ============================================================================
// SERVER CONTEXT TYPES
// ============================================================================

export interface AdaptivePlaylistContext {
  ytMusic: any; // Your existing YouTube Music client
  ytData: any; // Your existing YouTube Data API client
  musicBrainz: any; // Your existing MusicBrainz client
  listenBrainz: any; // Your existing ListenBrainz client
  db: Database;
  userId: string;
  conversationSessions: any;
  songFeatureExtractor: any;
}
```

---

## Phase 4: Profile Encoding System

### 4.1 Create Encoder

Create `src/adaptive-playlist/encoder.ts`:

```typescript
import type { Profile } from './types.js';

/**
 * Encode a profile to 37-character alphanumeric string
 * Format: 1-XXXXX... (1 version + 36 data characters)
 */
export function encodeProfile(profile: Partial<Profile>): string {
  const chars: string[] = [];
  
  // Position 0: Version
  chars.push(profile.version || '1');
  
  // Positions 1-2: Style Familiarity (0-1295, 2 chars)
  chars.push(encodeBase36(profile.styleFamiliarity ?? 500, 2));
  
  // Positions 3-4: Track Exposure (0-1295, 2 chars)
  chars.push(encodeBase36(profile.trackExposure ?? 7, 2));
  
  // Position 5: Recency (0-35, 1 char)
  chars.push(encodeBase36(profile.recency ?? 35, 1));
  
  // Positions 6-10: MUSIC Dimensions (0-35, 1 char each)
  chars.push(encodeBase36(profile.dimensions?.mellow ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.sophisticated ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.intense ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.contemporary ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.unpretentious ?? 17, 1));
  
  // Position 11: Tempo (0-35, 1 char)
  chars.push(encodeBase36(profile.tempo ?? 17, 1));
  
  // Position 12: Complexity (0-35, 1 char)
  chars.push(encodeBase36(profile.complexity ?? 17, 1));
  
  // Position 13: Mode (0-35, 1 char)
  chars.push(encodeBase36(profile.mode ?? 17, 1));
  
  // Position 14: Predictability (0-35, 1 char)
  chars.push(encodeBase36(profile.predictability ?? 17, 1));
  
  // Position 15: Consonance (0-35, 1 char)
  chars.push(encodeBase36(profile.consonance ?? 22, 1));
  
  // Position 16: Activity (0-15, 1 char)
  chars.push(encodeBase36(profile.activity ?? 0, 1));
  
  // Position 17: Time Pattern (0-35, 1 char)
  chars.push(encodeBase36(profile.timePattern ?? 35, 1));
  
  // Position 18: Social Function (0-35, 1 char)
  chars.push(encodeBase36(profile.socialFunction ?? 17, 1));
  
  // Position 19: Environment (0-9, 1 char)
  chars.push(encodeBase36(profile.environment ?? 0, 1));
  
  // Position 20: Mood Valence (0-35, 1 char)
  chars.push(encodeBase36(profile.mood?.valence ?? 17, 1));
  
  // Position 21: Mood Arousal (0-35, 1 char)
  chars.push(encodeBase36(profile.mood?.arousal ?? 17, 1));
  
  // Position 22: Target Valence (0-35, 1 char)
  chars.push(encodeBase36(profile.mood?.targetValence ?? -1, 1));
  
  // Position 23: Target Arousal (0-35, 1 char)
  chars.push(encodeBase36(profile.mood?.targetArousal ?? -1, 1));
  
  // Position 24: Regulation Strategy (0-9, 1 char)
  chars.push(encodeBase36(profile.mood?.regulationStrategy ?? 5, 1));
  
  // Position 25: Birth Decade (0-35, 1 char)
  chars.push(encodeBase36(profile.age?.birthDecade ?? -1, 1));
  
  // Position 26: Reminiscence Era (0-35, 1 char)
  chars.push(encodeBase36(profile.age?.reminiscenceEra ?? -1, 1));
  
  // Position 27: Stated Discovery (0-35, 1 char)
  chars.push(encodeBase36(profile.discovery?.stated ?? 17, 1));
  
  // Position 28: Behavioral Openness (0-35, 1 char)
  chars.push(encodeBase36(profile.discovery?.behavioral ?? -1, 1));
  
  // Position 29: Musical Training (0-9, 1 char)
  chars.push(encodeBase36(profile.sophistication?.training ?? 0, 1));
  
  // Position 30: Self-Rated Expertise (0-35, 1 char)
  chars.push(encodeBase36(profile.sophistication?.expertise ?? 17, 1));
  
  // Position 31: Openness Trait (0-35, 1 char)
  chars.push(encodeBase36(profile.tertiary?.openness ?? -1, 1));
  
  // Position 32: Extraversion (0-35, 1 char)
  chars.push(encodeBase36(profile.tertiary?.extraversion ?? -1, 1));
  
  // Position 33: Empathizing-Systemizing (0-35, 1 char)
  chars.push(encodeBase36(profile.tertiary?.empathizingSystemizing ?? -1, 1));
  
  // Position 34: Cultural Context (0-35, 1 char)
  chars.push(encodeBase36(profile.tertiary?.culturalContext ?? 17, 1));
  
  // Position 35: Lyric Importance (0-35, 1 char)
  chars.push(encodeBase36(profile.lyricImportance ?? 17, 1));
  
  // Position 36: Confidence (0-35, 1 char)
  chars.push(encodeBase36(calculateConfidence(profile), 1));
  
  const encoded = chars.join('');
  
  // Validate length
  if (encoded.length !== 37) {
    throw new Error(`Invalid encoding length: ${encoded.length}, expected 37`);
  }
  
  return encoded;
}

/**
 * Decode 37-character string to Profile
 */
export function decodeProfile(code: string): Profile {
  // Validate format
  if (code.length !== 37) {
    throw new Error(`Invalid profile code length: ${code.length}, expected 37`);
  }
  
  if (!/^[1-9A-Z]-[0-9A-ZX]{36}$/.test(code)) {
    throw new Error(`Invalid profile code format: ${code}`);
  }
  
  let pos = 0;
  
  // Position 0: Version
  const version = code[pos++];
  pos++; // Skip dash
  
  const profile: Profile = {
    version,
    styleFamiliarity: decodeBase36(code.substr(pos, 2)),
    trackExposure: decodeBase36(code.substr(pos + 2, 2)),
    recency: decodeBase36(code[pos + 4]),
    dimensions: {
      mellow: decodeBase36(code[pos + 5]),
      sophisticated: decodeBase36(code[pos + 6]),
      intense: decodeBase36(code[pos + 7]),
      contemporary: decodeBase36(code[pos + 8]),
      unpretentious: decodeBase36(code[pos + 9])
    },
    tempo: decodeBase36(code[pos + 10]),
    complexity: decodeBase36(code[pos + 11]),
    mode: decodeBase36(code[pos + 12]),
    predictability: decodeBase36(code[pos + 13]),
    consonance: decodeBase36(code[pos + 14]),
    activity: decodeBase36(code[pos + 15]),
    timePattern: decodeBase36(code[pos + 16]),
    socialFunction: decodeBase36(code[pos + 17]),
    environment: decodeBase36(code[pos + 18]),
    mood: {
      valence: decodeBase36(code[pos + 19]),
      arousal: decodeBase36(code[pos + 20]),
      targetValence: decodeBase36(code[pos + 21]),
      targetArousal: decodeBase36(code[pos + 22]),
      regulationStrategy: decodeBase36(code[pos + 23])
    },
    age: {
      birthDecade: decodeBase36(code[pos + 24]),
      reminiscenceEra: decodeBase36(code[pos + 25])
    },
    discovery: {
      stated: decodeBase36(code[pos + 26]),
      behavioral: decodeBase36(code[pos + 27])
    },
    sophistication: {
      training: decodeBase36(code[pos + 28]),
      expertise: decodeBase36(code[pos + 29])
    },
    tertiary: {
      openness: decodeBase36(code[pos + 30]),
      extraversion: decodeBase36(code[pos + 31]),
      empathizingSystemizing: decodeBase36(code[pos + 32]),
      culturalContext: decodeBase36(code[pos + 33])
    },
    lyricImportance: decodeBase36(code[pos + 34]),
    confidence: decodeBase36(code[pos + 35])
  };
  
  return profile;
}

/**
 * Calculate confidence score (0-35) based on profile completeness
 */
export function calculateConfidence(profile: Partial<Profile>): number {
  let score = 0;
  
  // Critical dimensions (30 points max)
  if (profile.styleFamiliarity !== undefined && profile.styleFamiliarity >= 0) {
    score += 10; // Familiarity is most important (30% weight)
  }
  if (profile.activity !== undefined && profile.activity >= 0) {
    score += 6; // Activity context (8% weight)
  }
  if (profile.dimensions && Object.values(profile.dimensions).some(v => v >= 0)) {
    score += 5; // MUSIC dimensions (12% weight)
  }
  if (profile.discovery?.stated !== undefined && profile.discovery.stated >= 0) {
    score += 4; // Discovery tolerance (4% weight)
  }
  if (profile.mood && (profile.mood.valence >= 0 || profile.mood.arousal >= 0)) {
    score += 3; // Mood (8% weight)
  }
  if (profile.age?.birthDecade !== undefined && profile.age.birthDecade >= 0) {
    score += 3; // Age (5% weight)
  }
  
  // Other dimensions (5 points max)
  const otherDimensions = [
    profile.tempo,
    profile.complexity,
    profile.mode,
    profile.socialFunction,
    profile.environment
  ].filter(v => v !== undefined && v >= 0);
  
  score += Math.min(otherDimensions.length, 4);
  
  return Math.min(35, score);
}

/**
 * Extract profile code from playlist description
 */
export function extractProfileCode(description: string): string | null {
  // Look for embedded profile: 🧬:1-XXXX... or PROFILE:1-XXXX...
  const patterns = [
    /🧬:([1-9A-Z]-[0-9A-ZX]{36})/,
    /PROFILE:([1-9A-Z]-[0-9A-ZX]{36})/i,
    /<!--\s*PROFILE:([1-9A-Z]-[0-9A-ZX]{36})\s*-->/
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Embed profile code in playlist description
 */
export function embedProfileCode(description: string, profileCode: string): string {
  return `${description}\n\n🧬:${profileCode}`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function encodeBase36(value: number, length: number): string {
  if (value < 0 || !Number.isFinite(value)) {
    return 'X'.repeat(length); // Unknown marker
  }
  
  const encoded = value.toString(36).toUpperCase();
  const padded = encoded.padStart(length, '0');
  
  return padded.slice(0, length); // Truncate if too long
}

function decodeBase36(encoded: string): number {
  if (encoded.includes('X')) {
    return -1; // Unknown marker
  }
  
  const value = parseInt(encoded, 36);
  return isNaN(value) ? -1 : value;
}
```

### 4.2 Test Encoder

Create `tests/adaptive-playlist/encoder.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals';
import { encodeProfile, decodeProfile, calculateConfidence } from '../../src/adaptive-playlist/encoder';
import type { Profile } from '../../src/adaptive-playlist/types';

describe('Profile Encoder', () => {
  test('encodes and decodes minimal profile', () => {
    const profile: Partial<Profile> = {
      version: '1',
      styleFamiliarity: 500,
      activity: 1,
      tempo: 28
    };
    
    const encoded = encodeProfile(profile);
    expect(encoded.length).toBe(37);
    expect(encoded[0]).toBe('1');
    expect(encoded[1]).toBe('-');
    
    const decoded = decodeProfile(encoded);
    expect(decoded.styleFamiliarity).toBe(500);
    expect(decoded.activity).toBe(1);
    expect(decoded.tempo).toBe(28);
  });
  
  test('encodes and decodes complete workout profile', () => {
    const profile: Partial<Profile> = {
      version: '1',
      styleFamiliarity: 787,
      trackExposure: 5,
      recency: 25,
      dimensions: {
        mellow: 28,
        sophisticated: 25,
        intense: 26,
        contemporary: 26,
        unpretentious: 26
      },
      tempo: 28,
      complexity: 8,
      mode: 30,
      activity: 1,
      mood: {
        valence: 17,
        arousal: 30,
        targetValence: 17,
        targetArousal: 30,
        regulationStrategy: 1
      },
      discovery: {
        stated: 9,
        behavioral: -1
      }
    };
    
    const encoded = encodeProfile(profile);
    expect(encoded.length).toBe(37);
    
    const decoded = decodeProfile(encoded);
    expect(decoded.styleFamiliarity).toBe(787);
    expect(decoded.dimensions.intense).toBe(26);
    expect(decoded.activity).toBe(1);
    expect(decoded.tempo).toBe(28);
  });
  
  test('handles unknown values with X', () => {
    const profile: Partial<Profile> = {
      version: '1',
      styleFamiliarity: -1 // Unknown
    };
    
    const encoded = encodeProfile(profile);
    expect(encoded.slice(2, 4)).toBe('XX');
  });
  
  test('calculates confidence correctly', () => {
    const minimalProfile: Partial<Profile> = {
      styleFamiliarity: 500
    };
    expect(calculateConfidence(minimalProfile)).toBe(10);
    
    const goodProfile: Partial<Profile> = {
      styleFamiliarity: 500,
      activity: 1,
      dimensions: {
        mellow: 17,
        sophisticated: 17,
        intense: 26,
        contemporary: 26,
        unpretentious: 17
      },
      discovery: { stated: 9, behavioral: -1 }
    };
    expect(calculateConfidence(goodProfile)).toBeGreaterThanOrEqual(25);
  });
  
  test('validates code format', () => {
    expect(() => decodeProfile('invalid')).toThrow();
    expect(() => decodeProfile('1-123')).toThrow(); // Too short
    expect(() => decodeProfile('1-' + 'A'.repeat(40))).toThrow(); // Too long
  });
});
```

Run test:
```bash
npm test -- encoder.test.ts
```

---

**Due to length constraints, I'll continue this guide in the next response with Phase 5-12. This covers the critical foundation. Would you like me to continue with the remaining phases?**
