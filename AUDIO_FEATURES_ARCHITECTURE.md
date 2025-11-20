# Audio Features Pipeline Architecture

## Overview

This document outlines the architecture for retrieving audio features for YouTube Music tracks using ISRC-based exact matching to avoid version ambiguity (covers, remixes, remasters, live versions).

## Data Flow

### Complete Pipeline
```
YouTube Music videoId
  → YouTube Data API (GET /youtube/v3/videos?part=contentDetails)
  → ISRC code (exact track identifier)
  → Spotify API (GET /v1/search?q=isrc:{code}&type=track)
  → Spotify ID (canonical track reference)
  → ReccoBeats API (GET /v1/track?ids={spotify_id})
  → ReccoBeats ID
  → ReccoBeats API (GET /v1/track/{reccobeats_id}/audio-features)
  → Audio Features (tempo, energy, valence, danceability, etc.)
```

### API Call Breakdown

| Step | API | Endpoint | Input | Output | Rate Limit |
|------|-----|----------|-------|--------|------------|
| 1 | YouTube Data API | `/youtube/v3/videos` | videoId | ISRC | 10,000 quota/day |
| 2 | Spotify API | `/v1/search` | ISRC | Spotify ID | 100 req/30sec |
| 3 | ReccoBeats API | `/v1/track` | Spotify ID | ReccoBeats ID | Unknown |
| 4 | ReccoBeats API | `/v1/track/{id}/audio-features` | ReccoBeats ID | Audio features | Unknown |

**Total: 4 API calls per track**

## Query Patterns

### 1. Single Track Lookup
**Use Case:** User asks about one specific song
```typescript
// Input: YouTube Music video ID
const videoId = 'dQw4w9WgXcQ';

// Output: Audio features
const features = await audioFeaturesService.getFeatures(videoId);
```

**Queries:**
- 1x YouTube Data API
- 1x Spotify search
- 2x ReccoBeats

### 2. Batch Track Lookup
**Use Case:** Analyzing user's library (100-500 songs)
```typescript
// Input: Array of YouTube Music video IDs
const videoIds = ['id1', 'id2', ..., 'id500'];

// Output: Array of audio features
const features = await audioFeaturesService.getBatchFeatures(videoIds);
```

**Queries:**
- 500x YouTube Data API (can batch up to 50 per request = 10 requests)
- 500x Spotify search (must be sequential or chunked)
- 1000x ReccoBeats (500 lookup + 500 features, chunked in parallel)

**Naive approach: 2,010 API calls**
**Optimized approach: 510 API calls** (with batching)

### 3. Playlist Analysis
**Use Case:** Generate playlist based on user taste (30-50 songs)
```typescript
// Input: Playlist ID
const playlistId = 'PLxxxxxxxxxxxx';

// Step 1: Get tracks from playlist
const tracks = await ytMusic.getPlaylistDetails(playlistId);

// Step 2: Get features for all tracks
const features = await audioFeaturesService.getBatchFeatures(
  tracks.map(t => t.videoId)
);
```

**Queries:**
- 1x YouTube Music API (get playlist)
- 1x YouTube Data API batch (get ISRCs for 50 tracks)
- 50x Spotify search
- 100x ReccoBeats (50 lookup + 50 features)

**Total: ~152 API calls** (with batching)

### 4. Recommendation Generation
**Use Case:** Find similar tracks (search + filter)
```typescript
// Step 1: Search YouTube Music
const searchResults = await ytMusic.searchSongs('psychedelic rock', 20);

// Step 2: Get features for candidates
const features = await audioFeaturesService.getBatchFeatures(
  searchResults.map(r => r.videoId)
);

// Step 3: Filter by audio features (code, not AI)
const filtered = features.filter(f =>
  f.energy > 0.6 && f.valence > 0.5
);
```

## Efficiency Strategies

### 1. Batching

**YouTube Data API:**
- Supports batching up to 50 video IDs per request
- Reduces 500 requests → 10 requests

```typescript
async getBatchISRCs(videoIds: string[]): Promise<Map<string, string | null>> {
  const results = new Map();
  const chunkSize = 50;

  for (let i = 0; i < videoIds.length; i += chunkSize) {
    const chunk = videoIds.slice(i, i + chunkSize);
    const response = await ytData.get('videos', {
      part: 'contentDetails',
      id: chunk.join(',')
    });

    // Map video IDs to ISRCs
    for (const item of response.items) {
      results.set(item.id, item.contentDetails.isrc || null);
    }
  }

  return results;
}
```

**Spotify API:**
- No batch endpoint, but can parallelize with rate limiting
- Chunk requests to respect 100 req/30sec limit

```typescript
async getBatchSpotifyIds(isrcs: string[]): Promise<Map<string, string | null>> {
  const results = new Map();
  const chunkSize = 10; // Conservative to avoid rate limits

  for (let i = 0; i < isrcs.length; i += chunkSize) {
    const chunk = isrcs.slice(i, i + chunkSize);

    // Parallel requests within chunk
    const promises = chunk.map(isrc =>
      spotify.searchTrackByISRC(isrc)
    );

    const chunkResults = await Promise.all(promises);
    chunk.forEach((isrc, idx) => {
      results.set(isrc, chunkResults[idx]?.id || null);
    });

    // Small delay between chunks
    if (i + chunkSize < isrcs.length) {
      await sleep(100);
    }
  }

  return results;
}
```

**ReccoBeats API:**
- Already implemented chunking in ReccoBeatsClient
- Processes 10 tracks in parallel with 100ms delay between chunks

### 2. Caching

**Cache Strategy:**
```typescript
interface CacheEntry {
  videoId: string;
  isrc: string | null;
  spotifyId: string | null;
  reccobeatsId: string | null;
  features: ReccoBeatsAudioFeatures | null;
  cachedAt: Date;
  expiresAt: Date;
}
```

**Cache Levels:**

1. **ISRC Cache** (Long-lived, rarely changes)
   - Key: `videoId` → ISRC
   - TTL: 30 days
   - Storage: Database

2. **Spotify ID Cache** (Long-lived)
   - Key: `isrc` → Spotify ID
   - TTL: 30 days
   - Storage: Database

3. **Audio Features Cache** (Medium-lived)
   - Key: `spotifyId` → Audio features
   - TTL: 7 days
   - Storage: Database

**Database Schema:**
```sql
CREATE TABLE audio_features_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input identifiers
  video_id VARCHAR(20) NOT NULL UNIQUE,

  -- Intermediate mappings
  isrc VARCHAR(20),
  spotify_id VARCHAR(30),
  reccobeats_id VARCHAR(50),

  -- Audio features (JSON)
  features JSONB,

  -- Metadata
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Indexes
  INDEX idx_video_id (video_id),
  INDEX idx_isrc (isrc),
  INDEX idx_spotify_id (spotify_id)
);
```

**Cache Hit Optimization:**
```typescript
async getFeatures(videoId: string): Promise<AudioFeatures | null> {
  // 1. Check cache first
  const cached = await db.query(
    'SELECT * FROM audio_features_cache WHERE video_id = $1 AND expires_at > NOW()',
    [videoId]
  );

  if (cached.rows[0]?.features) {
    logger.debug('Cache hit', { videoId });
    return cached.rows[0].features;
  }

  // 2. Cache miss - fetch from APIs
  const features = await this.fetchFromAPIs(videoId);

  // 3. Store in cache
  await this.cacheFeatures(videoId, features);

  return features;
}
```

### 3. Parallel Processing

**Smart Parallelization:**
```typescript
async getBatchFeatures(videoIds: string[]): Promise<AudioFeatures[]> {
  // 1. Check cache for all IDs
  const cacheResults = await this.checkCache(videoIds);
  const uncached = videoIds.filter(id => !cacheResults.has(id));

  logger.info('Cache analysis', {
    total: videoIds.length,
    cached: cacheResults.size,
    uncached: uncached.length
  });

  if (uncached.length === 0) {
    return Array.from(cacheResults.values());
  }

  // 2. Batch fetch ISRCs (parallel within YouTube API batch limit)
  const isrcs = await this.getBatchISRCs(uncached);

  // 3. Batch fetch Spotify IDs (parallel with rate limiting)
  const spotifyIds = await this.getBatchSpotifyIds(
    Array.from(isrcs.values()).filter(isrc => isrc !== null)
  );

  // 4. Batch fetch audio features (parallel with rate limiting)
  const features = await this.reccobeats.getMultipleAudioFeatures(
    Array.from(spotifyIds.values()).filter(id => id !== null)
  );

  // 5. Cache all results
  await this.cacheBatchResults(uncached, features);

  // 6. Combine cached + fresh results
  return this.combineResults(cacheResults, features);
}
```

### 4. Fallback Logic

**Graceful Degradation:**
```typescript
async getFeatures(videoId: string): Promise<AudioFeatures | null> {
  try {
    // Primary path: ISRC → Spotify → ReccoBeats
    const isrc = await this.ytData.getVideoISRC(videoId);

    if (isrc) {
      const spotifyTrack = await this.spotify.searchTrackByISRC(isrc);
      if (spotifyTrack) {
        const features = await this.reccobeats.getAudioFeatures(spotifyTrack.id);
        if (features) {
          return features;
        }
      }
    }

    // Fallback 1: Title/Artist search (less accurate)
    logger.warn('ISRC path failed, falling back to fuzzy search', { videoId });
    const trackInfo = await this.ytMusic.getSongInfo(videoId);

    if (trackInfo) {
      const spotifyTrack = await this.spotify.searchTrack(
        trackInfo.title,
        trackInfo.artist
      );

      if (spotifyTrack) {
        const features = await this.reccobeats.getAudioFeatures(spotifyTrack.id);
        if (features) {
          return { ...features, _fallback: true };
        }
      }
    }

    // Fallback 2: Default neutral features
    logger.warn('All paths failed, using default features', { videoId });
    return this.getDefaultFeatures();

  } catch (error) {
    logger.error('Failed to get audio features', { videoId, error });
    return null;
  }
}
```

## AI vs Code Responsibilities

### AI (Claude via MCP) Handles:

1. **User Interaction**
   - Conversational preference extraction
   - Asking follow-up questions
   - Presenting recommendations

2. **High-Level Decisions**
   - Which tracks to analyze
   - How many recommendations to generate
   - Playlist curation logic

3. **Tool Orchestration**
   - Calling MCP tools in correct order
   - Interpreting tool results
   - Error handling and retry logic

**Example AI Flow:**
```
1. User: "Make me a chill playlist"
2. AI calls: get_library_songs() → 200 tracks
3. AI calls: (internal) getBatchFeatures(videoIds) → audio features
4. AI filters: tracks with valence > 0.3, energy < 0.6
5. AI calls: create_playlist() with filtered tracks
6. AI responds: "Created 'Chill Vibes' with 45 tracks"
```

### Code (MCP Server) Handles:

1. **API Orchestration**
   - Managing 4-step lookup pipeline
   - Rate limiting and throttling
   - Retry logic for failed requests

2. **Data Persistence**
   - Caching ISRC mappings
   - Storing audio features
   - Database transactions

3. **Batch Optimization**
   - Parallel request processing
   - Request deduplication
   - Resource pooling

4. **Error Recovery**
   - Fallback to fuzzy search
   - Default feature values
   - Graceful degradation

**Code should NEVER:**
- Make subjective decisions about music taste
- Determine what makes a "good" playlist
- Interact with user directly

**AI should NEVER:**
- Manage caching logic
- Handle rate limiting
- Worry about API batching

## Internal API Design

### AudioFeaturesService

**Core Interface:**
```typescript
interface AudioFeaturesService {
  // Single track lookup
  getFeatures(videoId: string): Promise<AudioFeatures | null>;

  // Batch lookup (optimized)
  getBatchFeatures(videoIds: string[]): Promise<Map<string, AudioFeatures | null>>;

  // Cache management
  clearCache(videoId?: string): Promise<void>;
  getCacheStats(): Promise<CacheStats>;

  // Utility
  warmCache(videoIds: string[]): Promise<void>;
}

interface AudioFeatures {
  // Core features
  tempo: number;
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  speechiness: number;
  loudness: number;

  // Metadata
  videoId: string;
  isrc: string | null;
  spotifyId: string | null;
  source: 'cache' | 'api';
  fallback?: boolean;
  retrievedAt: Date;
}

interface CacheStats {
  totalEntries: number;
  cacheHitRate: number;
  oldestEntry: Date;
  newestEntry: Date;
  avgLookupTime: number;
}
```

### Implementation Structure

```
src/audio-features/
├── service.ts              # Main AudioFeaturesService
├── cache.ts                # Database cache layer
├── pipeline.ts             # 4-step API pipeline
├── batch.ts                # Batch processing logic
└── types.ts                # TypeScript interfaces
```

### Usage Examples

**Example 1: Single track (AI → MCP tool)**
```typescript
// Tool: get_song_audio_features
async function getSongAudioFeatures(videoId: string) {
  const features = await audioFeaturesService.getFeatures(videoId);

  return {
    videoId,
    tempo: features.tempo,
    energy: features.energy,
    mood: features.valence > 0.5 ? 'positive' : 'negative',
    danceability: features.danceability,
  };
}
```

**Example 2: Library analysis (AI → MCP tool)**
```typescript
// Tool: analyze_library_taste
async function analyzeLibraryTaste() {
  // 1. Get user's library
  const library = await ytMusic.getLibrarySongs(200);

  // 2. Get features for all tracks (optimized batch)
  const features = await audioFeaturesService.getBatchFeatures(
    library.map(s => s.videoId)
  );

  // 3. Compute aggregate statistics
  const stats = computeAggregateStats(features);

  return {
    avgTempo: stats.avgTempo,
    avgEnergy: stats.avgEnergy,
    avgValence: stats.avgValence,
    preferredMood: stats.avgValence > 0.5 ? 'upbeat' : 'mellow',
    topGenres: stats.topGenres,
  };
}
```

**Example 3: Smart filtering (Code, not AI)**
```typescript
// This runs in MCP server, not AI
async function findTracksWithFeatures(
  videoIds: string[],
  filters: AudioFeatureFilters
): Promise<string[]> {

  const features = await audioFeaturesService.getBatchFeatures(videoIds);

  // Pure code logic - no AI needed
  return Array.from(features.entries())
    .filter(([_, f]) => {
      if (!f) return false;

      return (
        f.tempo >= filters.minTempo &&
        f.tempo <= filters.maxTempo &&
        f.energy >= filters.minEnergy &&
        f.energy <= filters.maxEnergy &&
        f.valence >= filters.minValence &&
        f.valence <= filters.maxValence
      );
    })
    .map(([videoId, _]) => videoId);
}
```

## Performance Estimates

### Scenario 1: Analyze 200-song library (cold cache)
- YouTube Data API: 4 batched requests (50 per batch) = ~2 seconds
- Spotify API: 200 searches (10 parallel, chunked) = ~20 seconds
- ReccoBeats API: 200 lookups + 200 features (10 parallel) = ~40 seconds
- **Total: ~62 seconds**

### Scenario 2: Analyze 200-song library (warm cache, 80% hit rate)
- Cache lookups: 200 queries = ~1 second
- YouTube Data API: 1 batched request (40 remaining) = ~0.5 seconds
- Spotify API: 40 searches = ~4 seconds
- ReccoBeats API: 40 lookups + 40 features = ~8 seconds
- **Total: ~13.5 seconds**

### Scenario 3: Generate 30-track playlist (warm cache)
- Search YouTube Music: ~1 second
- Cache lookups: 30 queries = ~0.2 seconds
- Feature filtering: ~0.1 seconds
- Create playlist: ~1 second
- **Total: ~2.3 seconds**

## Recommendations

### Phase 1: Core Implementation
1. ✅ ReccoBeats client (done)
2. ✅ YouTube Data API ISRC method (done)
3. ⏳ Spotify ISRC search method
4. ⏳ AudioFeaturesService with basic caching
5. ⏳ Update SongFeatureExtractor

### Phase 2: Optimization
1. Database cache schema
2. Batch processing optimization
3. Smart parallel request handling
4. Cache warming strategies

### Phase 3: Advanced Features
1. Cache statistics and monitoring
2. Fallback strategies
3. Error recovery improvements
4. Performance metrics

## Questions for User

1. **Cache TTL**: What should be the expiration time for cached features?
   - Recommendation: 30 days (music metadata rarely changes)

2. **Fallback Strategy**: Should we use fuzzy search if ISRC fails?
   - Pro: Better coverage
   - Con: Version ambiguity returns

3. **Default Features**: What should default features be for tracks without data?
   - Option A: Null (skip track)
   - Option B: Neutral values (tempo=120, energy=0.5, etc.)
   - Option C: Infer from genre/tags

4. **Rate Limiting**: Should we implement aggressive rate limiting or optimize for speed?
   - Conservative: Slower but safer
   - Aggressive: Faster but may hit limits

5. **Monitoring**: Do you want analytics on cache hit rates, API latency, etc.?
