# Multi-User Database Architecture Guide
## Scalability & Performance for YouTube Music MCP Server

---

## Critical Consideration: Multi-Tenancy

Your MCP server will serve **hundreds or thousands of users concurrently**. This fundamentally changes the database architecture:

### Key Challenges

1. **Song Features Database Size**
   - YouTube Music has ~100 million songs
   - Each song = ~2KB of feature data
   - 100M songs × 2KB = **200GB of song features alone**
   - Can't store every possible song upfront

2. **User Data Isolation**
   - Each user has their own listening history
   - Each user has their own profiles and sessions
   - Need proper multi-tenancy with user_id everywhere

3. **Concurrent Access**
   - Multiple users generating playlists simultaneously
   - Connection pool exhaustion
   - Query performance with millions of rows

4. **Railway/PostgreSQL Limits**
   - Railway Starter: 512MB database
   - Pro: 8GB database
   - Scale: 32GB+ database
   - Need efficient storage strategy

5. **Cost Management**
   - Railway charges per GB
   - Query optimization critical
   - Caching strategy essential

---

## Revised Database Architecture

### 1. Shared Song Features (Global Pool)

**Key Principle**: Song features are **shared across ALL users** - don't duplicate!

```sql
-- SHARED table: One entry per song, used by all users
CREATE TABLE IF NOT EXISTS song_features (
  video_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  release_year INTEGER,
  
  -- MUSIC dimensions (0-35 scale)
  mellow INTEGER DEFAULT 17,
  sophisticated INTEGER DEFAULT 17,
  intense INTEGER DEFAULT 17,
  contemporary INTEGER DEFAULT 17,
  unpretentious INTEGER DEFAULT 17,
  
  -- Musical features
  tempo_bpm INTEGER,
  tempo_normalized INTEGER,
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
  popularity REAL DEFAULT 0.5,
  is_mainstream BOOLEAN DEFAULT false,
  has_lyrics BOOLEAN DEFAULT true,
  
  -- Analysis tracking
  analysis_source TEXT,
  analysis_confidence REAL DEFAULT 0.5,
  analysis_version INTEGER DEFAULT 1, -- For future schema updates
  first_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0, -- Track popularity for cleanup
  
  CONSTRAINT valid_dimensions CHECK (
    mellow BETWEEN 0 AND 35 AND
    sophisticated BETWEEN 0 AND 35 AND
    intense BETWEEN 0 AND 35 AND
    contemporary BETWEEN 0 AND 35 AND
    unpretentious BETWEEN 0 AND 35
  )
);

-- Indexes optimized for multi-user queries
CREATE INDEX idx_song_genres ON song_features USING GIN (genres);
CREATE INDEX idx_song_tags ON song_features USING GIN (tags);
CREATE INDEX idx_song_year ON song_features(release_year);
CREATE INDEX idx_song_tempo ON song_features(tempo_normalized);
CREATE INDEX idx_song_energy ON song_features(energy);
CREATE INDEX idx_song_dimensions ON song_features(mellow, sophisticated, intense, contemporary, unpretentious);
CREATE INDEX idx_song_popularity ON song_features(popularity DESC);
CREATE INDEX idx_song_last_accessed ON song_features(last_accessed_at); -- For cleanup

-- Partial index for frequently accessed songs (hot cache)
CREATE INDEX idx_song_hot ON song_features(access_count DESC) 
WHERE access_count > 10;
```

**Storage Strategy**: Lazy loading + cleanup

```typescript
// On-demand feature extraction
async function getOrExtractFeatures(videoId: string): Promise<Track> {
  // 1. Check database cache
  let track = await getCachedFeatures(videoId);
  
  if (track) {
    // Update access tracking
    await db.query(`
      UPDATE song_features 
      SET last_accessed_at = CURRENT_TIMESTAMP,
          access_count = access_count + 1
      WHERE video_id = $1
    `, [videoId]);
    
    return track;
  }
  
  // 2. Extract features on-demand
  track = await extractFeaturesFromMusicBrainz(videoId);
  
  // 3. Cache for future users
  await cacheFeatures(track);
  
  return track;
}

// Background job: Clean up old, rarely-accessed songs
async function cleanupStaleFeatures() {
  // Remove songs not accessed in 90 days with low access count
  await db.query(`
    DELETE FROM song_features
    WHERE last_accessed_at < NOW() - INTERVAL '90 days'
    AND access_count < 5
  `);
}
```

### 2. User-Specific Data (Properly Isolated)

```sql
-- USER-SPECIFIC: Each user has their own listening history
CREATE TABLE IF NOT EXISTS user_listening_history (
  id BIGSERIAL PRIMARY KEY, -- Use BIGSERIAL for scale
  user_id TEXT NOT NULL,     -- From OAuth (email or user ID)
  video_id TEXT NOT NULL,
  
  -- Listening metrics
  play_count INTEGER DEFAULT 1,
  completion_rate REAL, -- 0-1
  last_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  first_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- User actions
  added_to_library BOOLEAN DEFAULT FALSE,
  explicit_rating INTEGER CHECK (explicit_rating IN (-1, 0, 1)),
  
  -- Foreign key to shared song features (may be null if not yet extracted)
  FOREIGN KEY (video_id) REFERENCES song_features(video_id) ON DELETE SET NULL,
  
  -- Unique constraint per user-song pair
  UNIQUE(user_id, video_id)
);

-- Critical indexes for multi-user performance
CREATE INDEX idx_user_history_user ON user_listening_history(user_id, last_played_at DESC);
CREATE INDEX idx_user_history_video ON user_listening_history(video_id);
CREATE INDEX idx_user_history_recent ON user_listening_history(user_id, first_played_at DESC)
WHERE first_played_at > CURRENT_TIMESTAMP - INTERVAL '30 days'; -- Partial index for recent activity

-- Materialized view for user statistics (refresh periodically)
CREATE MATERIALIZED VIEW user_listening_stats AS
SELECT 
  user_id,
  COUNT(*) as total_tracks_played,
  SUM(play_count) as total_plays,
  AVG(completion_rate) as avg_completion_rate,
  COUNT(*) FILTER (WHERE added_to_library) as library_size,
  MAX(last_played_at) as last_active
FROM user_listening_history
GROUP BY user_id;

CREATE UNIQUE INDEX idx_user_stats ON user_listening_stats(user_id);

-- Refresh stats hourly via cron or background job
-- REFRESH MATERIALIZED VIEW CONCURRENTLY user_listening_stats;
```

```sql
-- USER-SPECIFIC: Cached computed profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  
  -- Latest encoded profile
  current_profile_code TEXT,
  
  -- Cached computed data (rebuilt from history periodically)
  familiar_styles JSONB, -- {genres: [], tags: [], dimensions: {}}
  average_features JSONB, -- {tempo: N, complexity: N, etc.}
  sophistication_level REAL,
  novelty_tolerance REAL,
  personality_indicators JSONB,
  
  -- Cache metadata
  profile_version INTEGER DEFAULT 1,
  cache_valid_until TIMESTAMP, -- Invalidate cache after N hours
  last_computed_at TIMESTAMP,
  computation_duration_ms INTEGER, -- Track performance
  
  -- User metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_playlists_created INTEGER DEFAULT 0
);

CREATE INDEX idx_user_active ON user_profiles(last_active_at DESC);
CREATE INDEX idx_user_cache_valid ON user_profiles(cache_valid_until) 
WHERE cache_valid_until < CURRENT_TIMESTAMP; -- Find expired caches
```

```sql
-- USER-SPECIFIC: Conversation sessions (temporary data)
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

CREATE INDEX idx_session_user ON conversation_sessions(user_id, created_at DESC);
CREATE INDEX idx_session_expires ON conversation_sessions(expires_at);
CREATE INDEX idx_session_active ON conversation_sessions(last_activity_at) 
WHERE NOT completed; -- Active sessions only

-- Auto-cleanup expired sessions
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
```

```sql
-- USER-SPECIFIC: Playlists
CREATE TABLE IF NOT EXISTS playlists (
  playlist_id TEXT PRIMARY KEY, -- YouTube playlist ID
  user_id TEXT NOT NULL,
  
  -- Playlist metadata
  name TEXT NOT NULL,
  description TEXT,
  profile_code TEXT NOT NULL, -- 37-char encoded profile
  
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

CREATE INDEX idx_playlist_user ON playlists(user_id, created_at DESC);
CREATE INDEX idx_playlist_code ON playlists(profile_code);
CREATE INDEX idx_playlist_recent ON playlists(created_at DESC) 
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'; -- Recent playlists
```

---

## Connection Pooling & Performance

### 1. Optimized Connection Pool

```typescript
// src/database/client.ts

import { Pool } from 'pg';

// Environment-based configuration
const isProduction = process.env.NODE_ENV === 'production';
const maxConnections = parseInt(process.env.DATABASE_POOL_MAX || '20');
const minConnections = parseInt(process.env.DATABASE_POOL_MIN || '5');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  
  // Connection pool settings for multi-user scale
  min: minConnections,
  max: maxConnections,
  
  // Timeouts
  idleTimeoutMillis: 30000,        // Close idle connections after 30s
  connectionTimeoutMillis: 5000,   // Wait max 5s for connection
  
  // Statement timeout (prevent long-running queries)
  statement_timeout: 10000,        // 10s max per query
  
  // Keep-alive for Railway/cloud hosting
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  
  // Application name for monitoring
  application_name: 'youtube-music-mcp'
});

// Monitor pool health
pool.on('connect', (client) => {
  console.log('New database connection established');
});

pool.on('acquire', (client) => {
  // Track active connections
  const activeConnections = pool.totalCount;
  const idleConnections = pool.idleCount;
  const waitingClients = pool.waitingCount;
  
  if (waitingClients > 5) {
    console.warn(`⚠️  High connection wait queue: ${waitingClients} clients waiting`);
  }
  
  if (activeConnections > maxConnections * 0.8) {
    console.warn(`⚠️  Connection pool near capacity: ${activeConnections}/${maxConnections}`);
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected database error:', err);
  // Don't crash on idle client errors
});

pool.on('remove', (client) => {
  console.log('Database connection removed from pool');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Draining database connection pool...');
  await pool.end();
  process.exit(0);
});

// Health check endpoint
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

export const db = {
  query: async (text: string, params?: any[]) => {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query (${duration}ms):`, text.substring(0, 100));
      }
      
      return result;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  },
  
  getClient: () => pool.connect()
};

export default db;
```

### 2. Query Optimization

```typescript
// src/adaptive-playlist/recommendation-engine.ts

export async function generateRecommendations(
  profileCode: string,
  targetCount: number,
  db: Database,
  userId: string // CRITICAL: Always pass userId
): Promise<RecommendationResult[]> {
  
  // Build optimized query with proper indexes
  const candidateQuery = `
    WITH user_history AS (
      -- Subquery for user's listening history (indexed)
      SELECT video_id, play_count, last_played_at
      FROM user_listening_history
      WHERE user_id = $1
    ),
    candidate_pool AS (
      -- Get candidate songs with features
      SELECT 
        sf.*,
        uh.play_count,
        uh.last_played_at,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - uh.last_played_at)) / 86400 AS days_since_play
      FROM song_features sf
      LEFT JOIN user_history uh ON sf.video_id = uh.video_id
      WHERE 
        -- Apply hard constraints based on profile
        sf.tempo_normalized >= $2 AND sf.tempo_normalized <= $3
        AND sf.energy >= $4
        -- Exclude very recent plays
        AND (uh.last_played_at IS NULL OR uh.last_played_at < CURRENT_TIMESTAMP - INTERVAL '3 hours')
      ORDER BY 
        -- Prioritize songs with features (indexed)
        sf.access_count DESC,
        RANDOM()
      LIMIT 500 -- Limit candidate pool for performance
    )
    SELECT * FROM candidate_pool;
  `;
  
  const profile = decodeProfile(profileCode);
  
  // Extract constraints from profile
  const tempoMin = Math.max(0, profile.tempo - 10);
  const tempoMax = Math.min(35, profile.tempo + 10);
  const energyMin = profile.activity === 1 ? 0.7 : 0.0; // Workout constraint
  
  const result = await db.query(candidateQuery, [
    userId,
    tempoMin,
    tempoMax,
    energyMin
  ]);
  
  const candidates = result.rows.map(rowToTrack);
  
  // Score in batches (don't load all into memory)
  const batchSize = 100;
  const allScored: RecommendationResult[] = [];
  
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const scored = batch.map(track => ({
      track,
      ...calculateFinalScore(track, profile, buildContextFromProfile(profile))
    }));
    allScored.push(...scored);
  }
  
  // Sort and return top N
  allScored.sort((a, b) => b.finalScore - a.finalScore);
  
  return enforceDiversity(allScored.slice(0, targetCount * 2), targetCount);
}
```

### 3. Caching Strategy

**Use Redis or in-memory cache for hot data**:

```typescript
// src/cache/redis.ts (optional but recommended for scale)

import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL, // Railway Redis addon
  socket: {
    connectTimeout: 5000
  }
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('✅ Redis connected'));

await redis.connect();

// Cache wrapper
export class CacheManager {
  
  // Cache user profile for 1 hour
  async getUserProfile(userId: string): Promise<Profile | null> {
    const cached = await redis.get(`profile:${userId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fetch from database
    const profile = await fetchUserProfileFromDB(userId);
    
    // Cache for 1 hour
    await redis.setEx(`profile:${userId}`, 3600, JSON.stringify(profile));
    
    return profile;
  }
  
  // Cache song features (shared across all users)
  async getSongFeatures(videoId: string): Promise<Track | null> {
    const cached = await redis.get(`song:${videoId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fetch from database
    const track = await fetchSongFeaturesFromDB(videoId);
    
    if (track) {
      // Cache for 24 hours (songs rarely change)
      await redis.setEx(`song:${videoId}`, 86400, JSON.stringify(track));
    }
    
    return track;
  }
  
  // Invalidate user cache when profile changes
  async invalidateUserProfile(userId: string): Promise<void> {
    await redis.del(`profile:${userId}`);
  }
}

export const cache = new CacheManager();
```

**In-memory LRU cache (lighter alternative)**:

```typescript
// src/cache/memory.ts

import { LRUCache } from 'lru-cache';

// Song features cache (shared across all users)
const songCache = new LRUCache<string, Track>({
  max: 10000, // Store 10k most-accessed songs (~20MB)
  ttl: 1000 * 60 * 60 * 24, // 24 hours
  updateAgeOnGet: true
});

// User profile cache (per-user data)
const profileCache = new LRUCache<string, Profile>({
  max: 5000, // Store 5k most-active users (~5MB)
  ttl: 1000 * 60 * 60, // 1 hour
  updateAgeOnGet: true
});

export { songCache, profileCache };
```

---

## Background Jobs

**Periodic maintenance tasks**:

```typescript
// src/jobs/maintenance.ts

import cron from 'node-cron';
import { db } from '../database/client.js';

export function startMaintenanceJobs() {
  
  // Every hour: Clean up expired sessions
  cron.schedule('0 * * * *', async () => {
    console.log('🧹 Cleaning up expired sessions...');
    const result = await db.query('SELECT cleanup_expired_sessions()');
    console.log(`Deleted ${result.rows[0].cleanup_expired_sessions} sessions`);
  });
  
  // Every 6 hours: Refresh materialized views
  cron.schedule('0 */6 * * *', async () => {
    console.log('🔄 Refreshing user statistics...');
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY user_listening_stats');
    console.log('✅ User statistics refreshed');
  });
  
  // Daily: Clean up old song features
  cron.schedule('0 2 * * *', async () => {
    console.log('🧹 Cleaning up stale song features...');
    const result = await db.query(`
      DELETE FROM song_features
      WHERE last_accessed_at < NOW() - INTERVAL '90 days'
      AND access_count < 5
      RETURNING video_id
    `);
    console.log(`Deleted ${result.rowCount} stale songs`);
  });
  
  // Daily: Update user activity timestamps
  cron.schedule('0 3 * * *', async () => {
    console.log('📊 Updating user activity metrics...');
    await db.query(`
      UPDATE user_profiles up
      SET last_active_at = (
        SELECT MAX(last_played_at) 
        FROM user_listening_history ulh 
        WHERE ulh.user_id = up.user_id
      )
    `);
  });
  
  // Weekly: Vacuum and analyze
  cron.schedule('0 4 * * 0', async () => {
    console.log('🔧 Running database maintenance...');
    await db.query('VACUUM ANALYZE');
    console.log('✅ Database maintenance complete');
  });
}
```

---

## Cost & Storage Management

### Railway Pricing Tiers

| Tier | Database Size | Connections | Monthly Cost | Best For |
|------|---------------|-------------|--------------|----------|
| Starter | 512MB | 20 | $5 | Development |
| Pro | 8GB | 100 | $20 | Small-Medium (1-1000 users) |
| Scale | 32GB+ | 500+ | $40+ | Large (1000+ users) |

### Storage Estimation

**Per User**:
```
User Profile: ~2KB
Listening History (1000 songs): ~50KB
Playlists (10): ~5KB
Sessions (active): ~10KB
---
Total per active user: ~67KB
```

**For 1000 active users**:
```
User data: 67KB × 1000 = 67MB
```

**Shared Song Features**:
```
10,000 songs: ~20MB
100,000 songs: ~200MB
1,000,000 songs: ~2GB
```

**Strategy**: Keep only actively-used songs (lazy loading + cleanup)

### Optimization Strategies

1. **Lazy Load Song Features**
   - Don't pre-populate database
   - Extract on-demand when first requested
   - Cache for future users
   - Clean up rarely-accessed songs (>90 days, <5 accesses)

2. **Partition Large Tables**
   ```sql
   -- Partition listening history by date for better performance
   CREATE TABLE user_listening_history (
     id BIGSERIAL,
     user_id TEXT NOT NULL,
     video_id TEXT NOT NULL,
     played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     -- ...
   ) PARTITION BY RANGE (played_at);
   
   -- Create monthly partitions
   CREATE TABLE user_listening_history_2024_01 
   PARTITION OF user_listening_history
   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
   
   -- Drop old partitions to free space
   DROP TABLE user_listening_history_2023_01;
   ```

3. **Archive Old Data**
   ```typescript
   // Move old listening history to cold storage
   async function archiveOldHistory() {
     const cutoffDate = new Date();
     cutoffDate.setMonth(cutoffDate.getMonth() - 6);
     
     // Export to S3 or Railway Volume
     const oldRecords = await db.query(`
       SELECT * FROM user_listening_history
       WHERE last_played_at < $1
     `, [cutoffDate]);
     
     await saveToArchive(oldRecords.rows);
     
     // Delete from main database
     await db.query(`
       DELETE FROM user_listening_history
       WHERE last_played_at < $1
     `, [cutoffDate]);
   }
   ```

4. **Compress JSONB Fields**
   ```sql
   -- Use JSONB with compression
   ALTER TABLE user_profiles 
   SET (toast_compression = lz4);
   ```

---

## Monitoring & Alerting

### Key Metrics to Track

```typescript
// src/monitoring/metrics.ts

export interface SystemMetrics {
  // Database
  dbConnectionsActive: number;
  dbConnectionsIdle: number;
  dbConnectionsWaiting: number;
  dbPoolUtilization: number; // Percentage
  dbSlowQueryCount: number;
  
  // Storage
  dbTotalSize: number; // Bytes
  songFeaturesCount: number;
  userCount: number;
  activeUsersLast24h: number;
  
  // Performance
  avgRecommendationTimeMs: number;
  cacheHitRate: number;
  errorRate: number;
  
  // User activity
  playlistsCreatedToday: number;
  conversationsActiveNow: number;
}

async function collectMetrics(): Promise<SystemMetrics> {
  // Database pool stats
  const pool = await checkDatabaseHealth();
  
  // Storage stats
  const dbSizeResult = await db.query(`
    SELECT pg_database_size(current_database()) as size
  `);
  const dbSize = dbSizeResult.rows[0].size;
  
  const songCountResult = await db.query(`
    SELECT COUNT(*) as count FROM song_features
  `);
  const songCount = songCountResult.rows[0].count;
  
  const userCountResult = await db.query(`
    SELECT COUNT(*) as count FROM user_profiles
  `);
  const userCount = userCountResult.rows[0].count;
  
  const activeUsersResult = await db.query(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM user_listening_history
    WHERE last_played_at > NOW() - INTERVAL '24 hours'
  `);
  const activeUsers = activeUsersResult.rows[0].count;
  
  return {
    dbConnectionsActive: pool.totalConnections - pool.idleConnections,
    dbConnectionsIdle: pool.idleConnections,
    dbConnectionsWaiting: pool.waitingClients,
    dbPoolUtilization: ((pool.totalConnections - pool.idleConnections) / 20) * 100,
    dbSlowQueryCount: 0, // Track separately
    dbTotalSize: dbSize,
    songFeaturesCount: songCount,
    userCount: userCount,
    activeUsersLast24h: activeUsers,
    avgRecommendationTimeMs: 0, // Track separately
    cacheHitRate: 0, // Track separately
    errorRate: 0, // Track separately
    playlistsCreatedToday: 0, // Track separately
    conversationsActiveNow: 0 // Track separately
  };
}

// Log metrics every 5 minutes
setInterval(async () => {
  const metrics = await collectMetrics();
  console.log('📊 System Metrics:', JSON.stringify(metrics, null, 2));
  
  // Alert if pool utilization > 80%
  if (metrics.dbPoolUtilization > 80) {
    console.error('🚨 ALERT: Database pool near capacity!');
    // Send alert to monitoring service
  }
  
  // Alert if storage > 7GB on Pro plan
  if (metrics.dbTotalSize > 7 * 1024 * 1024 * 1024) {
    console.error('🚨 ALERT: Database approaching size limit!');
  }
}, 5 * 60 * 1000);
```

### Railway Monitoring

Add to Railway dashboard:
- Database size graph
- Connection count graph
- Query performance
- Error rate

Use Railway's built-in metrics + custom logging.

---

## Rate Limiting Per User

Prevent abuse from individual users:

```typescript
// src/middleware/rate-limiter.ts

import { LRUCache } from 'lru-cache';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new LRUCache<string, RateLimitEntry>({
  max: 10000, // Track 10k users
  ttl: 1000 * 60 * 60 // 1 hour
});

export function checkRateLimit(
  userId: string,
  action: 'conversation' | 'generate' | 'query',
  limits: { max: number; windowMs: number }
): boolean {
  
  const key = `${userId}:${action}`;
  const now = Date.now();
  
  const entry = rateLimits.get(key);
  
  if (!entry || entry.resetAt < now) {
    // New window
    rateLimits.set(key, {
      count: 1,
      resetAt: now + limits.windowMs
    });
    return true;
  }
  
  if (entry.count >= limits.max) {
    return false; // Rate limit exceeded
  }
  
  entry.count++;
  rateLimits.set(key, entry);
  return true;
}

// Apply to tools
export async function withRateLimit(
  userId: string,
  action: string,
  fn: () => Promise<any>
) {
  const limits = {
    conversation: { max: 50, windowMs: 60 * 60 * 1000 }, // 50/hour
    generate: { max: 10, windowMs: 60 * 60 * 1000 },     // 10/hour
    query: { max: 100, windowMs: 60 * 60 * 1000 }        // 100/hour
  };
  
  const allowed = checkRateLimit(userId, action as any, limits[action]);
  
  if (!allowed) {
    throw new Error(`Rate limit exceeded for ${action}. Try again later.`);
  }
  
  return await fn();
}
```

---

## Revised Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...      # Railway auto-provided
DATABASE_POOL_MIN=5               # Min connections
DATABASE_POOL_MAX=20              # Max connections (adjust for plan)
DATABASE_STATEMENT_TIMEOUT=10000  # 10s query timeout

# Cache (optional but recommended)
REDIS_URL=redis://...             # Railway Redis addon

# Rate limiting
RATE_LIMIT_CONVERSATIONS_PER_HOUR=50
RATE_LIMIT_GENERATIONS_PER_HOUR=10
RATE_LIMIT_QUERIES_PER_HOUR=100

# Maintenance
CLEANUP_STALE_SONGS_DAYS=90
CLEANUP_OLD_HISTORY_MONTHS=6
```

---

## Summary: Multi-User Architecture

### Key Principles

1. **Shared Song Features**
   - One entry per song, used by ALL users
   - Lazy loading + cleanup strategy
   - Indexed for fast lookups

2. **Isolated User Data**
   - Every table with user data has `user_id`
   - Proper indexes on user_id columns
   - Materialized views for aggregations

3. **Connection Pooling**
   - Max 20 connections on Pro plan
   - Monitor pool health
   - Timeout long queries

4. **Caching Strategy**
   - Redis or in-memory for hot data
   - Song features cached 24h
   - User profiles cached 1h

5. **Background Jobs**
   - Clean expired sessions hourly
   - Refresh stats every 6h
   - Clean stale songs daily

6. **Cost Management**
   - Lazy load song features
   - Archive old history
   - Clean unused data
   - Monitor storage growth

7. **Rate Limiting**
   - Prevent abuse per user
   - Track by action type
   - Configurable limits

### Scaling Path

**0-100 users**: Railway Starter (512MB) ✅  
**100-1000 users**: Railway Pro (8GB) ✅  
**1000-5000 users**: Railway Scale (32GB) + Redis ✅  
**5000+ users**: Consider dedicated database or sharding ⚠️

### Next Steps

1. Implement revised schema with proper indexes
2. Add connection pooling with monitoring
3. Implement caching layer (Redis or in-memory)
4. Add background maintenance jobs
5. Set up rate limiting per user
6. Monitor metrics and adjust

This architecture supports **thousands of concurrent users** while keeping costs manageable on Railway! 🚀
