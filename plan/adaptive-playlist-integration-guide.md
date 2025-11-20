# AI-Guided Playlist Builder - Integration Guide
## YouTube Music MCP Server Implementation

---

## Overview

This guide shows how to integrate the AI-Guided Adaptive Playlist Builder into the existing YouTube Music MCP server, replacing the current smart playlist system while leveraging existing infrastructure.

**Repository**: https://github.com/CaullenOmdahl/youtube-music-mcp-server  
**Deployment**: Railway with encrypted token storage  
**Replacing**: 8 existing smart playlist tools

---

## Architecture Integration

### Current System (To Be Replaced)
```
Smart Playlist Tools (8):
├── start_smart_playlist_session
├── add_seed_artists
├── add_seed_tracks
├── refine_parameters
├── generate_recommendations
├── preview_recommendations
├── create_smart_playlist
└── list_smart_playlist_sessions
```

### New System (Adaptive Playlist)
```
Adaptive Playlist Tools (5):
├── start_playlist_conversation      (Replaces: start_session + add_seeds)
├── continue_conversation            (Replaces: refine_parameters)
├── generate_adaptive_playlist       (Replaces: generate + create)
├── create_from_reference            (New: reference-based creation)
└── view_playlist_profile            (New: decode playlist profiles)
```

**Reduction**: 8 tools → 5 tools (simpler, more intuitive)

---

## File Structure

### New Files to Create

```
youtube-music-mcp-server/
├── src/
│   ├── adaptive-playlist/
│   │   ├── types.ts                 # All TypeScript interfaces
│   │   ├── encoder.ts               # Profile encoding/decoding
│   │   ├── scoring/
│   │   │   ├── index.ts            # Main scoring orchestrator
│   │   │   ├── primary.ts          # Familiarity, Features, Context
│   │   │   ├── secondary.ts        # Mood, Age, Discovery, Sophistication
│   │   │   ├── tertiary.ts         # Personality, Cognitive, Cultural
│   │   │   └── modulation.ts       # Contextual adjustments
│   │   ├── recommendation-engine.ts # Generate recommendations
│   │   ├── session-manager.ts      # Conversation state management
│   │   ├── profile-storage.ts      # Database persistence
│   │   ├── song-features.ts        # Extract/infer musical features
│   │   └── AI-KNOWLEDGE.md         # Interview guide for AI
│   ├── tools/
│   │   └── adaptive-playlist.ts    # MCP tool registration
│   └── database/
│       └── schema.sql               # New tables for features/profiles
```

### Files to Modify

```
youtube-music-mcp-server/
├── src/
│   ├── server.ts                    # Register new tools, remove old ones
│   ├── types/
│   │   └── index.ts                # Export new types
│   └── config/
│       └── database.ts              # Add connection if not exists
```

### Files to Delete (After Migration)

```
youtube-music-mcp-server/
├── src/
│   ├── recommendations/
│   │   ├── session.ts               # Old session manager
│   │   └── engine.ts                # Old recommendation engine
│   └── tools/
│       └── smart-playlist.ts        # Old tool registrations
```

---

## Phase 1: Database Setup

### 1.1 Add PostgreSQL (if not already present)

Railway deployment needs persistent database for:
- Song features (MUSIC dimensions, tempo, complexity, etc.)
- User profiles (cached style preferences)
- Listening history (play counts, timestamps)
- Playlist metadata (profile codes)

**Railway Setup**:
```bash
# In Railway dashboard:
1. Add PostgreSQL plugin to project
2. Copy DATABASE_URL to environment variables
3. Railway will handle automatic connection
```

**Environment Variables** (add to Railway):
```bash
DATABASE_URL=postgresql://user:pass@host:port/db  # Auto-provided by Railway
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

### 1.2 Database Schema

Create `src/database/schema.sql`:

```sql
-- Song features with MUSIC dimensions and musical attributes
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
  tempo_normalized INTEGER, -- 0-35 scale
  energy REAL CHECK (energy BETWEEN 0 AND 1),
  complexity REAL CHECK (complexity BETWEEN 0 AND 1),
  mode INTEGER CHECK (mode BETWEEN 0 AND 35),
  predictability INTEGER CHECK (predictability BETWEEN 0 AND 35),
  consonance INTEGER CHECK (consonance BETWEEN 0 AND 35),
  valence INTEGER CHECK (valence BETWEEN 0 AND 35), -- Emotional positivity
  arousal INTEGER CHECK (arousal BETWEEN 0 AND 35), -- Energy level
  
  -- Metadata
  genres JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  popularity REAL DEFAULT 0.5 CHECK (popularity BETWEEN 0 AND 1),
  is_mainstream BOOLEAN DEFAULT false,
  has_lyrics BOOLEAN DEFAULT true,
  
  -- Analysis tracking
  analysis_source TEXT, -- 'musicbrainz', 'proxy', 'manual'
  analysis_confidence REAL DEFAULT 0.5,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_dimensions CHECK (
    mellow BETWEEN 0 AND 35 AND
    sophisticated BETWEEN 0 AND 35 AND
    intense BETWEEN 0 AND 35 AND
    contemporary BETWEEN 0 AND 35 AND
    unpretentious BETWEEN 0 AND 35
  )
);

CREATE INDEX idx_song_genres ON song_features USING GIN (genres);
CREATE INDEX idx_song_tags ON song_features USING GIN (tags);
CREATE INDEX idx_song_year ON song_features(release_year);
CREATE INDEX idx_song_tempo ON song_features(tempo_normalized);
CREATE INDEX idx_song_energy ON song_features(energy);

-- User listening history from YouTube Music
CREATE TABLE IF NOT EXISTS user_listening_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL, -- From OAuth session
  video_id TEXT NOT NULL,
  play_count INTEGER DEFAULT 1,
  completion_rate REAL, -- 0-1, how much they listened
  last_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  added_to_library BOOLEAN DEFAULT FALSE,
  explicit_rating INTEGER CHECK (explicit_rating IN (-1, 0, 1)), -- dislike/neutral/like
  
  FOREIGN KEY (video_id) REFERENCES song_features(video_id) ON DELETE CASCADE,
  UNIQUE(user_id, video_id)
);

CREATE INDEX idx_user_history ON user_listening_history(user_id, last_played_at DESC);
CREATE INDEX idx_user_video ON user_listening_history(user_id, video_id);

-- User profiles with cached computed data
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  current_profile_code TEXT, -- Latest 37-char encoded profile
  
  -- Cached computed data (rebuilt periodically from history)
  familiar_styles JSONB, -- {genres: [], tags: [], dimensions: {}}
  average_features JSONB, -- {tempo: N, complexity: N, etc.}
  sophistication_level REAL,
  novelty_tolerance REAL,
  personality_indicators JSONB, -- {openness: N, extraversion: N}
  
  -- Metadata
  profile_version INTEGER DEFAULT 1,
  last_computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversation sessions (in-memory + persistent backup)
CREATE TABLE IF NOT EXISTS conversation_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_partial JSONB, -- Partial profile being built
  conversation_history JSONB, -- Array of {role, message, timestamp}
  questions_asked INTEGER DEFAULT 0,
  confidence INTEGER DEFAULT 0,
  ai_notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_session_user ON conversation_sessions(user_id);
CREATE INDEX idx_session_expires ON conversation_sessions(expires_at);

-- Playlists with embedded profiles
CREATE TABLE IF NOT EXISTS playlists (
  playlist_id TEXT PRIMARY KEY, -- YouTube playlist ID
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  profile_code TEXT NOT NULL, -- 37-char encoded profile
  
  -- Metadata
  track_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_playlist_user ON playlists(user_id, created_at DESC);
CREATE INDEX idx_playlist_code ON playlists(profile_code);

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM conversation_sessions 
  WHERE expires_at < NOW() AND NOT completed;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (if pg_cron available, otherwise run via cron job)
-- SELECT cron.schedule('cleanup-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions()');
```

### 1.3 Database Client Setup

Create `src/database/client.ts`:

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
  max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function initializeDatabase(): Promise<void> {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    
    // Run migrations
    const schemaSql = await readFile('src/database/schema.sql', 'utf-8');
    await client.query(schemaSql);
    console.log('✅ Database schema initialized');
    
    client.release();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  getClient: () => pool.connect()
};

export default db;
```

---

## Phase 2: Core Implementation

### 2.1 Types Definition

Create `src/adaptive-playlist/types.ts`:

```typescript
// Copy all types from the corrected implementation plan
// Key interfaces:
export interface Profile { /* ... */ }
export interface MUSICDimensions { /* ... */ }
export interface Track { /* ... */ }
export interface Context { /* ... */ }
export interface ConversationSession { /* ... */ }
export interface RecommendationResult { /* ... */ }

// Add server context type
export interface AdaptivePlaylistContext {
  ytMusic: YTMusic;           // Existing YouTube Music client
  ytData: YouTubeDataAPI;     // Existing YouTube Data API client
  musicBrainz: MusicBrainz;   // Existing MusicBrainz client
  listenBrainz: ListenBrainz; // Existing ListenBrainz client
  db: Database;               // PostgreSQL client
  userId: string;             // From OAuth session
}
```

### 2.2 Song Features Extraction

Create `src/adaptive-playlist/song-features.ts`:

This leverages your **existing MusicBrainz integration**:

```typescript
import type { MusicBrainz } from '../services/musicbrainz.js';
import type { Track, MUSICDimensions } from './types.js';
import { db } from '../database/client.js';

/**
 * Extract or infer musical features for a song using MusicBrainz data
 */
export class SongFeatureExtractor {
  constructor(
    private musicBrainz: MusicBrainz,
    private listenBrainz: any
  ) {}

  /**
   * Get or create song features
   */
  async getTrackFeatures(videoId: string): Promise<Track | null> {
    // Check cache first
    const cached = await this.getCachedFeatures(videoId);
    if (cached) return cached;

    // Extract from MusicBrainz
    const features = await this.extractFeatures(videoId);
    if (features) {
      await this.cacheFeatures(features);
      return features;
    }

    return null;
  }

  private async getCachedFeatures(videoId: string): Promise<Track | null> {
    const result = await db.query(
      'SELECT * FROM song_features WHERE video_id = $1',
      [videoId]
    );

    if (result.rows.length === 0) return null;

    return this.rowToTrack(result.rows[0]);
  }

  private async extractFeatures(videoId: string): Promise<Track | null> {
    try {
      // Get song metadata from your existing YouTube Music API
      const songInfo = await this.getSongInfo(videoId);
      if (!songInfo) return null;

      // Search MusicBrainz for this artist/track
      const mbData = await this.musicBrainz.search(
        songInfo.artist,
        songInfo.title
      );

      if (!mbData) {
        // Create with defaults
        return this.createDefaultTrack(songInfo);
      }

      // Extract tags and map to MUSIC dimensions
      const tags = mbData.tags || [];
      const dimensions = this.mapTagsToMUSICDimensions(tags);

      // Infer other features from genre/tags
      const tempo = this.inferTempo(mbData.genre, tags);
      const complexity = this.inferComplexity(mbData.genre, tags);
      const mode = this.inferMode(tags);
      const energy = this.inferEnergy(tempo, dimensions);

      return {
        videoId,
        title: songInfo.title,
        artist: songInfo.artist,
        releaseYear: mbData.releaseYear || 2020,
        dimensions,
        tempo,
        energy,
        complexity,
        mode,
        predictability: 17, // Default neutral
        consonance: 22, // Default moderate consonance
        valence: 17, // Default neutral
        arousal: this.calculateArousal(energy, dimensions),
        genres: mbData.genres || [mbData.genre || 'unknown'],
        tags,
        popularity: 0.5, // TODO: Calculate from ListenBrainz
        mainstream: false,
        isTrending: false,
        hasLyrics: true,
        userPlayCount: 0,
        isNewArtist: false,
        artistFamiliarity: 0
      };

    } catch (error) {
      console.error('Error extracting features:', error);
      return null;
    }
  }

  /**
   * Map MusicBrainz tags to MUSIC dimensions
   * Based on research correlations
   */
  private mapTagsToMUSICDimensions(tags: string[]): MUSICDimensions {
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    // Initialize with neutral values
    const dimensions: MUSICDimensions = {
      mellow: 17,
      sophisticated: 17,
      intense: 17,
      contemporary: 17,
      unpretentious: 17
    };

    // Mellow indicators (smooth, relaxing)
    const mellowTags = ['chill', 'mellow', 'smooth', 'relaxing', 'soft', 'calm', 'ambient'];
    const mellowScore = this.countMatches(tagSet, mellowTags);
    if (mellowScore > 0) dimensions.mellow = Math.min(35, 17 + mellowScore * 5);

    // Sophisticated indicators (complex, cerebral)
    const sophisticatedTags = ['jazz', 'classical', 'progressive', 'art', 'experimental', 'complex'];
    const sophScore = this.countMatches(tagSet, sophisticatedTags);
    if (sophScore > 0) dimensions.sophisticated = Math.min(35, 17 + sophScore * 5);

    // Intense indicators (loud, energetic)
    const intenseTags = ['metal', 'punk', 'hardcore', 'aggressive', 'loud', 'heavy', 'intense'];
    const intenseScore = this.countMatches(tagSet, intenseTags);
    if (intenseScore > 0) dimensions.intense = Math.min(35, 17 + intenseScore * 5);

    // Contemporary indicators (electronic, hip-hop)
    const contemporaryTags = ['electronic', 'hip-hop', 'rap', 'dance', 'edm', 'trap', 'dubstep'];
    const contemScore = this.countMatches(tagSet, contemporaryTags);
    if (contemScore > 0) dimensions.contemporary = Math.min(35, 17 + contemScore * 5);

    // Unpretentious indicators (folk, country, sincere)
    const unpretentiousTags = ['folk', 'country', 'singer-songwriter', 'acoustic', 'traditional'];
    const unpreScore = this.countMatches(tagSet, unpretentiousTags);
    if (unpreScore > 0) dimensions.unpretentious = Math.min(35, 17 + unpreScore * 5);

    return dimensions;
  }

  private countMatches(tagSet: Set<string>, keywords: string[]): number {
    return keywords.filter(k => tagSet.has(k)).length;
  }

  /**
   * Infer tempo from genre and tags
   */
  private inferTempo(genre: string, tags: string[]): number {
    const genreLower = genre?.toLowerCase() || '';
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    // Genre-based tempo estimation (normalized to 0-35 scale)
    const tempoMap: Record<string, number> = {
      'classical': 12,    // ~70 BPM
      'ambient': 8,       // ~60 BPM
      'folk': 15,         // ~90 BPM
      'rock': 20,         // ~110 BPM
      'pop': 22,          // ~120 BPM
      'dance': 28,        // ~130 BPM
      'electronic': 26,   // ~128 BPM
      'metal': 30,        // ~140 BPM
      'punk': 32,         // ~150 BPM
      'drum and bass': 35 // ~170 BPM
    };

    for (const [genreKey, tempo] of Object.entries(tempoMap)) {
      if (genreLower.includes(genreKey)) return tempo;
    }

    // Tag-based adjustments
    if (tagSet.has('fast') || tagSet.has('energetic')) return 28;
    if (tagSet.has('slow') || tagSet.has('ballad')) return 10;

    return 17; // Default medium tempo
  }

  /**
   * Infer complexity from genre and tags
   */
  private inferComplexity(genre: string, tags: string[]): number {
    const genreLower = genre?.toLowerCase() || '';
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    // High complexity genres
    if (genreLower.includes('jazz') || genreLower.includes('progressive') ||
        genreLower.includes('classical')) {
      return 0.8;
    }

    // Low complexity genres
    if (genreLower.includes('pop') || genreLower.includes('country')) {
      return 0.3;
    }

    // Tag-based
    if (tagSet.has('complex') || tagSet.has('experimental')) return 0.9;
    if (tagSet.has('simple') || tagSet.has('minimalist')) return 0.2;

    return 0.5; // Default medium
  }

  private inferMode(tags: string[]): number {
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    
    // Minor mode indicators
    if (tagSet.has('melancholy') || tagSet.has('sad') || tagSet.has('dark')) {
      return 5; // Minor
    }
    
    // Major mode indicators
    if (tagSet.has('happy') || tagSet.has('upbeat') || tagSet.has('cheerful')) {
      return 30; // Major
    }
    
    return 17; // Neutral
  }

  private inferEnergy(tempo: number, dimensions: MUSICDimensions): number {
    // Energy correlates with tempo and intensity
    const tempoEnergy = tempo / 35; // Normalize to 0-1
    const intensityEnergy = dimensions.intense / 35;
    
    return (tempoEnergy * 0.6 + intensityEnergy * 0.4);
  }

  private calculateArousal(energy: number, dimensions: MUSICDimensions): number {
    // Arousal is similar to energy but includes excitement factor
    const arousal = energy * 0.7 + (dimensions.intense / 35) * 0.3;
    return Math.round(arousal * 35);
  }

  private async cacheFeatures(track: Track): Promise<void> {
    await db.query(`
      INSERT INTO song_features (
        video_id, title, artist, release_year,
        mellow, sophisticated, intense, contemporary, unpretentious,
        tempo_normalized, energy, complexity, mode, 
        predictability, consonance, valence, arousal,
        genres, tags, popularity, has_lyrics,
        analysis_source, analysis_confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      ON CONFLICT (video_id) DO UPDATE SET
        last_updated = CURRENT_TIMESTAMP
    `, [
      track.videoId, track.title, track.artist, track.releaseYear,
      track.dimensions.mellow, track.dimensions.sophisticated,
      track.dimensions.intense, track.dimensions.contemporary,
      track.dimensions.unpretentious,
      track.tempo, track.energy, track.complexity, track.mode,
      track.predictability, track.consonance, track.valence, track.arousal,
      JSON.stringify(track.genres), JSON.stringify(track.tags),
      track.popularity, track.hasLyrics,
      'musicbrainz', 0.7
    ]);
  }

  private rowToTrack(row: any): Track {
    return {
      videoId: row.video_id,
      title: row.title,
      artist: row.artist,
      releaseYear: row.release_year,
      dimensions: {
        mellow: row.mellow,
        sophisticated: row.sophisticated,
        intense: row.intense,
        contemporary: row.contemporary,
        unpretentious: row.unpretentious
      },
      tempo: row.tempo_normalized,
      energy: row.energy,
      complexity: row.complexity,
      mode: row.mode,
      predictability: row.predictability,
      consonance: row.consonance,
      valence: row.valence,
      arousal: row.arousal,
      genres: row.genres || [],
      tags: row.tags || [],
      popularity: row.popularity,
      mainstream: row.is_mainstream,
      isTrending: false,
      hasLyrics: row.has_lyrics,
      userPlayCount: 0,
      isNewArtist: false,
      artistFamiliarity: 0
    };
  }

  private createDefaultTrack(songInfo: any): Track {
    // Minimal track with defaults when no MusicBrainz data
    return {
      videoId: songInfo.videoId,
      title: songInfo.title,
      artist: songInfo.artist,
      releaseYear: 2020,
      dimensions: {
        mellow: 17,
        sophisticated: 17,
        intense: 17,
        contemporary: 17,
        unpretentious: 17
      },
      tempo: 17,
      energy: 0.5,
      complexity: 0.5,
      mode: 17,
      predictability: 17,
      consonance: 22,
      valence: 17,
      arousal: 17,
      genres: ['unknown'],
      tags: [],
      popularity: 0.5,
      mainstream: false,
      isTrending: false,
      hasLyrics: true,
      userPlayCount: 0,
      isNewArtist: false,
      artistFamiliarity: 0
    };
  }

  private async getSongInfo(videoId: string): Promise<any> {
    // Use your existing YouTube Music API to get basic info
    // This should be implemented based on your current ytMusic client
    return {
      videoId,
      title: 'Unknown',
      artist: 'Unknown'
    };
  }
}
```

### 2.3 Encoder Implementation

Create `src/adaptive-playlist/encoder.ts`:

```typescript
// Copy the complete encoder from the corrected plan
// Key functions:
// - encodeProfile(profile: Partial<Profile>): string
// - decodeProfile(code: string): Profile
// - calculateConfidence(profile: Partial<Profile>): number
// - extractProfileCode(description: string): string | null
// - embedProfileCode(description: string, code: string): string
```

### 2.4 Scoring Engine

Create the scoring module structure:

```
src/adaptive-playlist/scoring/
├── index.ts       # Main orchestrator, exports calculateFinalScore
├── primary.ts     # Familiarity, Features, Context (70%)
├── secondary.ts   # Mood, Age, Discovery, Sophistication (20%)
├── tertiary.ts    # Personality, Cognitive, Cultural (10%)
└── modulation.ts  # Contextual adjustments
```

**Key**: Each file exports functions with normalized [0,1] outputs. See corrected plan for full implementations.

---

## Phase 3: MCP Tool Integration

### 3.1 Modify Server Registration

Update `src/server.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Existing imports
import { registerQueryTools } from './tools/query.js';
import { registerPlaylistTools } from './tools/playlist.js';
import { registerSystemTools } from './tools/system.js';

// NEW: Remove old smart playlist import
// import { registerSmartPlaylistTools } from './tools/smart-playlist.js';

// NEW: Add adaptive playlist import
import { registerAdaptivePlaylistTools } from './tools/adaptive-playlist.js';

// NEW: Add database
import { initializeDatabase, db } from './database/client.js';
import { ConversationSessionManager } from './adaptive-playlist/session-manager.js';
import { SongFeatureExtractor } from './adaptive-playlist/song-features.js';

async function main() {
  // Initialize database first
  await initializeDatabase();

  const server = new Server({
    name: 'youtube-music-mcp-server',
    version: '2.0.0' // Bump version for major change
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Initialize clients (existing)
  const ytMusic = new YTMusic();
  const ytData = new YouTubeDataAPI();
  const musicBrainz = new MusicBrainz();
  const listenBrainz = new ListenBrainz();

  // NEW: Initialize adaptive playlist components
  const conversationSessions = new ConversationSessionManager(db);
  const songFeatureExtractor = new SongFeatureExtractor(musicBrainz, listenBrainz);

  const context = {
    ytMusic,
    ytData,
    musicBrainz,
    listenBrainz,
    db,
    conversationSessions,
    songFeatureExtractor
  };

  // Register tool groups
  registerQueryTools(server, context);
  registerPlaylistTools(server, context);
  
  // NEW: Replace smart playlist with adaptive
  // registerSmartPlaylistTools(server, context); // REMOVE THIS
  registerAdaptivePlaylistTools(server, context); // ADD THIS
  
  registerSystemTools(server, context);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('✅ YouTube Music MCP Server with Adaptive Playlists running');
}

main().catch(console.error);
```

### 3.2 Create Tool Registrations

Create `src/tools/adaptive-playlist.ts`:

```typescript
import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { AdaptivePlaylistContext } from '../adaptive-playlist/types.js';
import { encodeProfile, decodeProfile, extractProfileCode } from '../adaptive-playlist/encoder.js';
import { generateRecommendations } from '../adaptive-playlist/recommendation-engine.js';

export function registerAdaptivePlaylistTools(
  server: Server,
  context: AdaptivePlaylistContext
): void {

  /**
   * Tool 1: Start adaptive conversation
   */
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('start_playlist_conversation'),
        arguments: z.object({})
      })
    },
    async (request) => {
      const session = await context.conversationSessions.createSession(context.userId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId: session.sessionId,
            message: "I'd love to help create the perfect playlist! What have you been listening to lately?",
            confidence: 0,
            questionsAsked: 0,
            canGenerate: false
          }, null, 2)
        }]
      };
    }
  );

  /**
   * Tool 2: Continue conversation with user answer
   */
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('continue_conversation'),
        arguments: z.object({
          sessionId: z.string(),
          userMessage: z.string()
        })
      })
    },
    async (request) => {
      const { sessionId, userMessage } = request.params.arguments;

      // Get session
      const session = await context.conversationSessions.getSession(sessionId);
      if (!session) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Session not found or expired' }, null, 2)
          }],
          isError: true
        };
      }

      // Update session with user's answer
      await context.conversationSessions.addMessage(sessionId, 'user', userMessage);

      // Return session state for AI to analyze and ask next question
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId,
            conversationHistory: session.conversationHistory,
            currentProfile: session.profile,
            questionsAsked: session.questionsAsked,
            confidence: session.confidence,
            canGenerate: session.confidence >= 21 && session.questionsAsked >= 5,
            suggestedNextQuestion: null // AI will determine this
          }, null, 2)
        }]
      };
    }
  );

  /**
   * Tool 3: Generate playlist from conversation
   */
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('generate_adaptive_playlist'),
        arguments: z.object({
          sessionId: z.string(),
          playlistName: z.string().optional(),
          trackCount: z.number().default(30),
          createOnYouTube: z.boolean().default(true)
        })
      })
    },
    async (request) => {
      const { sessionId, playlistName, trackCount, createOnYouTube } = request.params.arguments;

      // Get session
      const session = await context.conversationSessions.getSession(sessionId);
      if (!session) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Session not found' }, null, 2)
          }],
          isError: true
        };
      }

      // Check confidence
      if (session.confidence < 21) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Insufficient profile confidence',
              confidence: session.confidence,
              needed: 21,
              suggestion: 'Ask a few more questions to build a better profile'
            }, null, 2)
          }],
          isError: true
        };
      }

      // Encode profile
      const profileCode = encodeProfile(session.profile);

      // Generate recommendations
      const recommendations = await generateRecommendations(
        profileCode,
        trackCount,
        context.db
      );

      // Create playlist on YouTube if requested
      let playlistId = null;
      let playlistUrl = null;

      if (createOnYouTube) {
        const name = playlistName || generatePlaylistName(session.profile);
        const description = generateDescription(session.profile, profileCode);

        // Use existing YouTube Data API client
        playlistId = await context.ytData.createPlaylist(name, description);
        playlistUrl = `https://music.youtube.com/playlist?list=${playlistId}`;

        // Add tracks in batch
        const videoIds = recommendations.map(r => r.track.videoId);
        await context.ytData.addToPlaylist(playlistId, videoIds);

        // Save to database
        await context.db.query(`
          INSERT INTO playlists (playlist_id, user_id, name, description, profile_code, track_count)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [playlistId, context.userId, name, description, profileCode, videoIds.length]);
      }

      // Mark session complete
      await context.conversationSessions.completeSession(sessionId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            playlistId,
            playlistUrl,
            profileCode,
            trackCount: recommendations.length,
            tracks: recommendations.slice(0, 10).map(r => ({
              title: r.track.title,
              artist: r.track.artist,
              score: r.score.toFixed(3),
              novelty: r.track.noveltyScore > 0.5 ? 'discovery' : 'familiar'
            })),
            message: `Created "${playlistName || name}" with ${recommendations.length} tracks!`
          }, null, 2)
        }]
      };
    }
  );

  /**
   * Tool 4: Create playlist from reference
   */
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('create_from_reference'),
        arguments: z.object({
          referencePlaylistId: z.string(),
          variation: z.enum(['similar', 'different', 'evolve']).default('similar'),
          trackCount: z.number().default(30)
        })
      })
    },
    async (request) => {
      const { referencePlaylistId, variation, trackCount } = request.params.arguments;

      // Get reference playlist from database
      const result = await context.db.query(
        'SELECT profile_code FROM playlists WHERE playlist_id = $1',
        [referencePlaylistId]
      );

      if (result.rows.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Reference playlist not found' }, null, 2)
          }],
          isError: true
        };
      }

      // Decode and modify profile
      const profile = decodeProfile(result.rows[0].profile_code);

      // Apply variation
      if (variation === 'different') {
        // Increase discovery
        profile.discovery.stated = Math.min(35, profile.discovery.stated + 10);
      } else if (variation === 'evolve') {
        // Update based on listening history
        // TODO: Implement style evolution
      }

      // Generate new profile code
      const newProfileCode = encodeProfile(profile);

      // Generate recommendations
      const recommendations = await generateRecommendations(
        newProfileCode,
        trackCount,
        context.db
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            variation,
            newProfileCode,
            recommendations: recommendations.slice(0, 10).map(r => ({
              title: r.track.title,
              artist: r.track.artist,
              score: r.score.toFixed(3)
            }))
          }, null, 2)
        }]
      };
    }
  );

  /**
   * Tool 5: View playlist profile
   */
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('view_playlist_profile'),
        arguments: z.object({
          playlistId: z.string()
        })
      })
    },
    async (request) => {
      const { playlistId } = request.params.arguments;

      const result = await context.db.query(
        'SELECT profile_code, name, track_count, created_at FROM playlists WHERE playlist_id = $1',
        [playlistId]
      );

      if (result.rows.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ found: false }, null, 2)
          }]
        };
      }

      const row = result.rows[0];
      const profile = decodeProfile(row.profile_code);
      const summary = generateHumanReadableSummary(profile);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            found: true,
            playlistName: row.name,
            trackCount: row.track_count,
            createdAt: row.created_at,
            profileCode: row.profile_code,
            profile: summary
          }, null, 2)
        }]
      };
    }
  );

  // Register tool list
  server.setRequestHandler({ method: 'tools/list' }, async () => ({
    tools: [
      {
        name: 'start_playlist_conversation',
        description: 'Start an adaptive conversation to build a personalized playlist. The AI will ask questions to understand your music preferences.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'continue_conversation',
        description: 'Continue the adaptive playlist conversation by providing your answer to the AI\'s question. Returns session state for the AI to ask the next question.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from start_playlist_conversation'
            },
            userMessage: {
              type: 'string',
              description: 'Your answer to the AI\'s question'
            }
          },
          required: ['sessionId', 'userMessage']
        }
      },
      {
        name: 'generate_adaptive_playlist',
        description: 'Generate a personalized playlist from the conversation profile. Creates playlist on YouTube Music.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID from the conversation'
            },
            playlistName: {
              type: 'string',
              description: 'Optional custom name for the playlist'
            },
            trackCount: {
              type: 'number',
              description: 'Number of tracks to include (default: 30)',
              default: 30
            },
            createOnYouTube: {
              type: 'boolean',
              description: 'Whether to create on YouTube Music (default: true)',
              default: true
            }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'create_from_reference',
        description: 'Create a new playlist based on an existing playlist\'s profile. Options: similar (same style), different (more exploration), evolve (adapt to recent listening).',
        inputSchema: {
          type: 'object',
          properties: {
            referencePlaylistId: {
              type: 'string',
              description: 'YouTube playlist ID to use as reference'
            },
            variation: {
              type: 'string',
              enum: ['similar', 'different', 'evolve'],
              description: 'How to vary from reference',
              default: 'similar'
            },
            trackCount: {
              type: 'number',
              description: 'Number of tracks (default: 30)',
              default: 30
            }
          },
          required: ['referencePlaylistId']
        }
      },
      {
        name: 'view_playlist_profile',
        description: 'Decode and view the preference profile embedded in a playlist. Shows what factors influenced the recommendations.',
        inputSchema: {
          type: 'object',
          properties: {
            playlistId: {
              type: 'string',
              description: 'YouTube playlist ID'
            }
          },
          required: ['playlistId']
        }
      }
    ]
  }));
}

// Helper functions
function generatePlaylistName(profile: Partial<Profile>): string {
  const activity = profile.activity || 0;
  const activityNames = [
    'Personalized Mix', 'Workout Energy', 'Focus Flow', 'Chill Vibes',
    'Party Mix', 'Commute Soundtrack', 'Background Beats', 'Discovery Session'
  ];
  return activityNames[Math.min(activity, activityNames.length - 1)];
}

function generateDescription(profile: Partial<Profile>, profileCode: string): string {
  const activity = profile.activity || 0;
  const discovery = (profile.discovery?.stated || 17) / 35;
  
  let desc = 'AI-curated playlist based on your preferences. ';
  
  if (discovery > 0.6) {
    desc += 'Heavy on discoveries and exploration.';
  } else if (discovery < 0.3) {
    desc += 'Focused on your familiar favorites.';
  } else {
    desc += 'Balanced mix of familiar and new.';
  }
  
  // Embed profile code using emoji prefix
  return `${desc}\n\n🧬:${profileCode}`;
}

function generateHumanReadableSummary(profile: Profile): any {
  return {
    style: {
      familiarityLevel: profile.styleFamiliarity > 800 ? 'high' : profile.styleFamiliarity > 400 ? 'moderate' : 'low',
      dimensions: {
        mellow: profile.dimensions.mellow / 35,
        sophisticated: profile.dimensions.sophisticated / 35,
        intense: profile.dimensions.intense / 35,
        contemporary: profile.dimensions.contemporary / 35,
        unpretentious: profile.dimensions.unpretentious / 35
      }
    },
    context: {
      activity: ['none', 'workout', 'focus', 'relax', 'social', 'commute'][profile.activity] || 'other',
      mood: {
        valence: profile.mood.valence < 12 ? 'negative' : profile.mood.valence > 23 ? 'positive' : 'neutral',
        arousal: profile.mood.arousal < 12 ? 'calm' : profile.mood.arousal > 23 ? 'energetic' : 'moderate'
      }
    },
    preferences: {
      discoveryLevel: profile.discovery.stated / 35,
      complexity: profile.complexity / 35,
      tempo: profile.tempo < 12 ? 'slow' : profile.tempo > 24 ? 'fast' : 'moderate'
    },
    confidence: profile.confidence / 35
  };
}
```

---

## Phase 4: Testing

### 4.1 Unit Tests

```typescript
// tests/adaptive-playlist/encoder.test.ts
describe('Profile Encoding', () => {
  test('encodes and decodes workout profile', () => {
    const profile: Partial<Profile> = {
      version: '1',
      styleFamiliarity: 787,
      activity: 1,
      tempo: 28,
      discovery: { stated: 9, behavioral: -1 }
    };
    
    const encoded = encodeProfile(profile);
    expect(encoded.length).toBe(37);
    
    const decoded = decodeProfile(encoded);
    expect(decoded.styleFamiliarity).toBe(787);
    expect(decoded.activity).toBe(1);
  });
});

// tests/adaptive-playlist/song-features.test.ts
describe('Song Feature Extraction', () => {
  test('maps metal tags to high intense dimension', async () => {
    const extractor = new SongFeatureExtractor(mockMusicBrainz, mockListenBrainz);
    
    const dimensions = extractor['mapTagsToMUSICDimensions'](['metal', 'heavy', 'aggressive']);
    
    expect(dimensions.intense).toBeGreaterThan(25);
  });
});
```

### 4.2 Integration Test

```bash
# Test the full flow
npm run test:integration

# Manual MCP test using Claude Desktop
# 1. Update Claude config to point to your server
# 2. Start conversation: "Help me create a workout playlist"
# 3. Verify AI asks appropriate questions
# 4. Check playlist is created on YouTube Music
```

---

## Phase 5: Deployment to Railway

### 5.1 Environment Variables

Add to Railway project:

```bash
# Existing (keep these)
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=...
MUSICBRAINZ_USER_AGENT=...

# New for database
DATABASE_URL=postgresql://...  # Auto-provided by Railway Postgres
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Optional: Feature flags
ENABLE_ADAPTIVE_PLAYLISTS=true
ADAPTIVE_MIN_CONFIDENCE=21
```

### 5.2 Railway Deployment

```bash
# Build and deploy
railway up

# Or via GitHub integration (recommended)
git push origin main  # Railway auto-deploys
```

### 5.3 Database Migrations

Railway will automatically run migrations on deploy if you set up the build command:

```json
// package.json
{
  "scripts": {
    "build": "tsc && npm run migrate",
    "migrate": "node dist/database/migrate.js"
  }
}
```

Create `src/database/migrate.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { db, initializeDatabase } from './client.js';

async function migrate() {
  try {
    console.log('🔄 Running database migrations...');
    
    await initializeDatabase();
    
    console.log('✅ Migrations complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
```

---

## Phase 6: Migration Strategy

### 6.1 Gradual Rollout

Use feature flags to control rollout:

```typescript
// In server.ts
const ENABLE_ADAPTIVE = process.env.ENABLE_ADAPTIVE_PLAYLISTS === 'true';

if (ENABLE_ADAPTIVE) {
  registerAdaptivePlaylistTools(server, context);
} else {
  registerSmartPlaylistTools(server, context);
}
```

### 6.2 Parallel Operation

Run both systems for 1-2 weeks:
- Collect metrics on both
- A/B test with users
- Gradually increase adaptive adoption

### 6.3 Data Migration

Optionally migrate existing smart playlist data:

```typescript
async function migrateSmartPlaylists() {
  // Get all smart playlists
  const oldPlaylists = await db.query('SELECT * FROM smart_playlists');
  
  for (const old of oldPlaylists.rows) {
    // Convert to new format
    const profile = convertOldToNewProfile(old);
    const profileCode = encodeProfile(profile);
    
    // Update playlist description
    await updatePlaylistDescription(old.playlist_id, profileCode);
  }
}
```

### 6.4 Deprecation Plan

Week 1-2: Parallel operation  
Week 3: Adaptive as default, smart playlist available  
Week 4: Deprecation notice on smart playlist  
Week 5+: Remove smart playlist code

---

## Success Metrics

### Track These Metrics

```typescript
interface Metrics {
  // Conversation quality
  avgQuestionsAsked: number;          // Target: 5-7
  avgConfidenceAtGeneration: number;  // Target: 25+
  conversationCompletionRate: number; // Target: >80%
  
  // Recommendation quality
  skipRate: number;                   // Target: <15%
  completionRate: number;             // Target: >70%
  likeRate: number;                   // Target: >30%
  
  // Discovery success
  novelTracksAccepted: number;        // Target: >40%
  repeatListenRate: number;           // Target: >40%
  
  // Technical
  avgRecommendationTime: number;      // Target: <2s
  errorRate: number;                  // Target: <1%
}
```

### Dashboard

Use Railway metrics + custom logging:

```typescript
logger.info('adaptive_playlist_metrics', {
  timestamp: new Date(),
  userId,
  sessionId,
  confidence,
  questionsAsked,
  generationTimeMs,
  trackCount,
  skipRate,
  // ...
});
```

---

## Troubleshooting

### Common Issues

**Database connection fails**:
```bash
# Check Railway logs
railway logs

# Verify DATABASE_URL is set
railway variables
```

**Song features not extracting**:
```typescript
// Check MusicBrainz rate limits
// Add delays between requests
await sleep(1000);
```

**Playlist not creating**:
```typescript
// Verify YouTube OAuth tokens
// Check quota limits (10,000 units/day)
```

**Profile encoding errors**:
```typescript
// Validate input ranges
// Check for NaN or undefined values
```

---

## Next Steps

1. **Week 1**: Implement core infrastructure (database, encoder, types)
2. **Week 2**: Build scoring engine and recommendation system
3. **Week 3**: Create MCP tool integrations and test
4. **Week 4**: Deploy to Railway and monitor
5. **Week 5+**: Iterate based on metrics and user feedback

---

## Resources

- Original corrected plan: `/home/claude/ai-playlist-builder-corrected.md`
- Research paper references: See scoring system document
- MCP SDK docs: https://modelcontextprotocol.io
- Railway docs: https://docs.railway.app
- GitHub repo: https://github.com/CaullenOmdahl/youtube-music-mcp-server

---

## Summary

This integration guide provides a complete path to adding the AI-Guided Adaptive Playlist Builder to your existing YouTube Music MCP server. The system:

✅ Replaces 8 tools with 5 simpler, more intuitive tools  
✅ Leverages existing MusicBrainz/ListenBrainz integration  
✅ Works with current Railway deployment  
✅ Maintains OAuth authentication flow  
✅ Adds PostgreSQL for persistent song features  
✅ Implements research-backed recommendation scoring  
✅ Provides gradual migration path  

Ready to build the future of personalized music recommendations! 🎵
