# Discovery & API Call Optimization Analysis

## Executive Summary

**KEY DISCOVERY:** Spotify's Recommendations API can **massively reduce API calls** by providing:
1. Pre-filtered recommendations based on audio features
2. ISRC codes in the response (no extra lookup needed!)
3. Up to 100 tracks per request
4. Built-in similarity algorithms

**Result:** Can reduce 400+ API calls down to ~10 API calls for playlist generation.

---

## Current Discovery Flow

### Smart Playlist System (Existing)

**Purpose:** Generate playlists based on artist/genre seeds + tags

**Flow:**
```
1. AI extracts seed artists from user
   ↓
2. MusicBrainz: Resolve artist names → MBIDs + tags
   (1 API call per artist)
   ↓
3. ListenBrainz Radio: Get recommendations based on artist prompt
   (1 API call, returns 50-100 track names)
   ↓
4. YouTube Music: Search for each recommended track
   (1 API call per track = 50-100 calls)
   ↓
5. Result: YouTube Music track list
```

**API Calls for 50 recommendations:**
- 3 seed artists × 1 call = 3 calls (MusicBrainz)
- 1 call (ListenBrainz Radio)
- 50 calls (YouTube Music search)
- **Total: 54 calls**

**Problems:**
- No audio feature filtering (can't filter by tempo/energy/mood)
- No ISRC returned (need additional lookups)
- YouTube Music search by title/artist is fuzzy (version ambiguity)

---

### Adaptive Playlist System (Under Development)

**Purpose:** Generate playlists based on user's music taste profile + audio features

**Planned Flow (before optimization):**
```
1. AI analyzes user library (200 tracks)
   ↓
2. For each track:
   - YouTube Data API: Get ISRC (batched 50/request = 4 calls)
   - Spotify: Search by ISRC (200 calls)
   - ReccoBeats: Lookup Spotify ID (200 calls)
   - ReccoBeats: Get audio features (200 calls)
   ↓
3. Build taste profile from 200 feature sets
   ↓
4. Search for candidates (genre/artist search)
   - YouTube Music: Search (1-5 calls, 20 results each)
   ↓
5. For each candidate (100 tracks):
   - YouTube Data API: Get ISRC (2 batched calls)
   - Spotify: Search by ISRC (100 calls)
   - ReccoBeats: Lookup + features (200 calls)
   ↓
6. Filter by audio features (code)
   ↓
7. Select top 30 tracks
```

**API Calls:**
- Library analysis: 604 calls (4 + 200 + 200 + 200)
- Candidate discovery: 5 calls
- Candidate analysis: 302 calls (2 + 100 + 200)
- **Total: 911 calls** 😱

**Major Issues:**
- Analyzing EVERY candidate track is expensive
- No pre-filtering before feature extraction
- Spotify used only for ISRC→ID translation (inefficient)

---

## API Call Reduction Strategies (Non-Database)

### Strategy 1: Use Spotify Recommendations API 🚀

**Game Changer:** Spotify has a recommendations endpoint that:
- Takes seed tracks/artists (up to 5)
- Filters by audio features (min/max/target)
- Returns tracks WITH ISRCs
- Returns up to 100 recommendations per call

**Spotify Recommendations API:**
```
GET /v1/recommendations
  ?seed_tracks={spotify_id_1},{spotify_id_2}
  &seed_artists={spotify_artist_id}
  &target_energy=0.7
  &min_valence=0.4
  &max_valence=0.9
  &target_tempo=120
  &limit=100
```

**Response includes:**
```json
{
  "tracks": [
    {
      "id": "spotify_id",
      "name": "Track Name",
      "artists": [...],
      "external_ids": {
        "isrc": "USRC12345678"  // ← ISRC included!
      },
      "popularity": 75,
      // ... other metadata
    }
  ]
}
```

**Advantages:**
✅ **Spotify does the recommendation logic** (similar tracks)
✅ **Spotify does the audio feature filtering** (energy, valence, tempo, etc.)
✅ **Returns ISRC directly** (no extra lookup!)
✅ **100 tracks per request** (vs 1 track per request)
✅ **No version ambiguity** (Spotify knows the exact recording)

---

### Strategy 2: In-Memory Session Caching

**Concept:** Cache results in memory for the duration of a user session (not persistent database)

**Use Cases:**
- User asks: "Find me upbeat songs"
- Gets recommendations
- User refines: "Actually, make them more danceable"
- Reuse ISRCs/Spotify IDs from previous search

**Implementation:**
```typescript
class RecommendationSession {
  private trackCache: Map<string, {
    isrc: string;
    spotifyId: string;
    features: AudioFeatures;
    cachedAt: number;
  }> = new Map();

  // Cache expires after 1 hour (session-based)
  private TTL = 3600000;

  getCached(videoId: string): CachedTrack | null {
    const cached = this.trackCache.get(videoId);
    if (cached && Date.now() - cached.cachedAt < this.TTL) {
      return cached;
    }
    return null;
  }
}
```

**Benefits:**
- No database setup
- Automatic cleanup when session ends
- Fast lookups for iterative refinement
- Works well with conversational AI flow

**API Savings:**
- First request: Full cost
- Refinements: ~90% reduction (only new tracks)

---

### Strategy 3: Lazy Feature Extraction

**Concept:** Only get audio features for tracks that pass initial filters

**Flow:**
```
1. Get recommendations from Spotify (with ISRC)
   ↓
2. Filter by metadata (popularity, release date, etc.)
   ↓
3. ONLY THEN get ReccoBeats features for remaining tracks
```

**Example:**
- Spotify returns 100 tracks with ISRCs
- Filter by popularity > 30: 60 tracks remain
- Filter by release date > 2015: 40 tracks remain
- **Only fetch ReccoBeats features for 40 tracks** (vs 100)

**API Savings:** 60% reduction in ReccoBeats calls

---

### Strategy 4: Batch Everything Aggressively

**YouTube Data API:**
- Supports 50 video IDs per request
- Current: Not batching enough

**Spotify Search by ISRC:**
- No batch endpoint, but parallelize 10 at a time
- Use Promise.all() with chunking

**ReccoBeats:**
- Already batching 10 per chunk
- Could increase to 20 with better rate limit handling

---

### Strategy 5: Use Spotify for Discovery, ReccoBeats for Verification

**Concept:** Let Spotify do the heavy lifting, use ReccoBeats sparingly

**Flow:**
```
1. Spotify Recommendations API
   - Returns 100 tracks with ISRCs + basic features
   - Filters by energy, valence, tempo ranges
   ↓
2. Filter by Spotify's built-in features
   - Narrow to top 50 candidates
   ↓
3. ReccoBeats (only if needed)
   - Get detailed features for final selection
   - Only for top 30 tracks
```

**Note:** Spotify's own audio features would be ideal, but they're deprecated. However, Spotify Recommendations API DOES filter by audio features server-side!

---

## Optimized Discovery Pipeline

### Option A: Spotify-First Discovery (Recommended)

**Use Case:** User wants playlist based on mood/energy/tempo

**Flow:**
```
1. Analyze user's library (one-time, session cached)
   - Get 5-10 seed tracks (user's top played or favorites)
   - YouTube Music → ISRC → Spotify ID (batched)
   - API calls: ~20 total
   ↓
2. Get recommendations from Spotify
   - Use seed tracks + audio feature targets
   - Returns 100 tracks WITH ISRCs
   - API calls: 1
   ↓
3. Search YouTube Music for recommended ISRCs
   - Search by "artist name + track name" (from Spotify response)
   - Parallel requests, 10 at a time
   - API calls: 100 (can't batch YouTube Music search)
   ↓
4. (Optional) Get ReccoBeats features for final ranking
   - Only for top 30 candidates
   - ISRC → Spotify ID → ReccoBeats
   - API calls: ~60 (30 lookups + 30 features)
```

**Total API Calls:**
- Initial setup: 20
- Spotify recommendations: 1
- YouTube Music search: 100
- ReccoBeats refinement: 60
- **Total: 181 calls** (vs 911 calls = 80% reduction!)

---

### Option B: Hybrid Discovery

**Use Case:** User wants genre-based recommendations with YouTube Music catalog

**Flow:**
```
1. ListenBrainz Radio OR Spotify Recommendations
   - Get candidate track list
   - API calls: 1
   ↓
2. Search YouTube Music for candidates
   - API calls: 50-100
   ↓
3. Get ISRCs for YouTube Music results (batched)
   - API calls: 2-5
   ↓
4. Spotify ISRC lookup for features (if needed)
   - Or use ReccoBeats
   - API calls: 50-100
```

**Total: ~150-200 calls**

---

### Option C: Pure Spotify Recommendations (Most Efficient)

**Use Case:** Maximum efficiency, rely entirely on Spotify's algorithms

**Flow:**
```
1. Get user's top YouTube Music tracks
   - YouTube Music library: 1 call
   ↓
2. Convert 3-5 seed tracks to Spotify IDs
   - YouTube Music → ISRC → Spotify
   - API calls: ~10
   ↓
3. Spotify Recommendations with feature filtering
   - Returns 100 tracks with ISRCs + full metadata
   - API calls: 1
   ↓
4. Search YouTube Music for Spotify recommendations
   - Use artist + title from Spotify response
   - API calls: 100
   ↓
5. Done!
```

**Total: ~112 calls** (90% reduction!)

**Why this works:**
- Spotify recommendations are high quality
- ISRCs ensure exact track matching
- No need for ReccoBeats (Spotify did the filtering)
- YouTube Music search by "artist + title" is reliable when you have exact metadata

---

## API Call Comparison Table

| Scenario | Old Approach | Optimized Approach | Reduction |
|----------|--------------|-------------------|-----------|
| **Taste profile analysis (200 tracks)** | 604 calls | 20 calls (session cached) | **97%** |
| **Generate 50-track playlist** | 911 calls | 112 calls | **88%** |
| **Refine existing playlist** | 302 calls | 5 calls (session cache) | **98%** |
| **Discover similar to 1 track** | 204 calls | 11 calls | **95%** |

---

## Recommendation Engine Decision Tree

```
User Request
    |
    ├─ "Songs like [track]"
    │   └─ Use: Spotify Recommendations (seed_tracks)
    │      API calls: ~10
    |
    ├─ "Songs by vibe/mood/energy"
    │   └─ Use: Spotify Recommendations (audio feature filters)
    │      API calls: ~112
    |
    ├─ "Songs like [artist]"
    │   └─ Use: Spotify Recommendations (seed_artists)
    │      OR ListenBrainz Radio
    │      API calls: ~50-112
    |
    └─ "Deep genre exploration"
        └─ Use: ListenBrainz Radio (best for niche genres)
           + YouTube Music search
           API calls: ~55
```

---

## Implementation Plan

### Phase 1: Add Spotify Recommendations Client

```typescript
// src/spotify/client.ts

async getRecommendations(params: {
  seedTracks?: string[];      // Spotify IDs
  seedArtists?: string[];     // Spotify IDs
  seedGenres?: string[];      // Genre names
  targetEnergy?: number;      // 0-1
  minEnergy?: number;
  maxEnergy?: number;
  targetValence?: number;     // 0-1
  minValence?: number;
  maxValence?: number;
  targetTempo?: number;       // BPM
  minTempo?: number;
  maxTempo?: number;
  targetDanceability?: number;
  // ... more audio features
  limit?: number;             // Max 100
}): Promise<SpotifyRecommendation[]> {
  // Returns tracks with ISRCs!
}

interface SpotifyRecommendation {
  id: string;                 // Spotify ID
  name: string;
  artists: Array<{name: string}>;
  isrc: string;              // ← Key: ISRC included!
  popularity: number;
  // ... other metadata
}
```

### Phase 2: Session-Based Cache

```typescript
// src/recommendations/cache.ts

export class RecommendationCache {
  private sessions: Map<string, SessionCache> = new Map();

  getSession(sessionId: string): SessionCache {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new SessionCache());
    }
    return this.sessions.get(sessionId)!;
  }

  cleanup(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

class SessionCache {
  private tracks: Map<string, CachedTrack> = new Map();
  private createdAt = Date.now();
  private TTL = 3600000; // 1 hour

  get(videoId: string): CachedTrack | null {
    const track = this.tracks.get(videoId);
    if (track && Date.now() - this.createdAt < this.TTL) {
      return track;
    }
    return null;
  }

  set(videoId: string, track: CachedTrack): void {
    this.tracks.set(videoId, track);
  }
}
```

### Phase 3: Spotify-First Discovery Engine

```typescript
// src/recommendations/spotify-discovery.ts

export class SpotifyDiscoveryEngine {
  async discover(params: {
    seedTracks?: YouTubeMusicTrack[];  // User's favorites
    targetFeatures: {
      energy?: [number, number];       // [min, max]
      valence?: [number, number];
      tempo?: [number, number];
    };
    limit: number;
  }): Promise<YouTubeMusicTrack[]> {

    // 1. Convert seed tracks to Spotify IDs
    const spotifySeeds = await this.convertToSpotifyIds(params.seedTracks);

    // 2. Get Spotify recommendations (with ISRCs!)
    const recommendations = await this.spotify.getRecommendations({
      seedTracks: spotifySeeds.slice(0, 5),
      targetEnergy: this.calculateTarget(params.targetFeatures.energy),
      minEnergy: params.targetFeatures.energy?.[0],
      maxEnergy: params.targetFeatures.energy?.[1],
      // ... other features
      limit: params.limit,
    });

    // 3. Search YouTube Music for recommended tracks
    const ytMusicTracks = await this.searchOnYouTubeMusic(recommendations);

    return ytMusicTracks;
  }
}
```

---

## Questions for User

1. **Spotify Recommendations Priority:**
   - Should we prioritize Spotify Recommendations API for discovery?
   - Or keep ListenBrainz Radio for genre exploration?
   - Recommendation: Use both - Spotify for mood/features, ListenBrainz for genres

2. **Session Caching:**
   - Implement in-memory session cache (no database)?
   - TTL: 1 hour reasonable?
   - Recommendation: Yes, perfect for conversational refinement

3. **ReccoBeats Usage:**
   - Only use ReccoBeats when Spotify Recommendations isn't enough?
   - Or always verify with ReccoBeats for accuracy?
   - Recommendation: Spotify Recommendations should be sufficient (they filter server-side)

4. **ISRC Trust:**
   - Trust Spotify's ISRCs for YouTube Music search?
   - Or verify with YouTube Data API?
   - Recommendation: Trust Spotify ISRCs (they're authoritative)

---

## Final Recommendation

**Implement Spotify-First Discovery (Option C):**

### Why:
✅ **88-95% API call reduction** (vs current approach)
✅ **No database required** (session caching only)
✅ **Spotify's algorithms are proven** (powers Discover Weekly, Radio, etc.)
✅ **ISRCs eliminate version ambiguity**
✅ **Server-side feature filtering** (no need to analyze every candidate)
✅ **Scales to large playlists** (100 tracks per request)

### Trade-offs:
⚠️ Relies on Spotify's catalog (but it's comprehensive)
⚠️ Still need YouTube Music search (but that's our target platform anyway)
⚠️ ReccoBeats becomes optional (only for edge cases)

### Implementation Effort:
- Add Spotify Recommendations method: **2 hours**
- Session-based cache: **1 hour**
- Integrate into adaptive playlist flow: **2 hours**
- Testing: **2 hours**
- **Total: ~7 hours**

### Result:
- 90% fewer API calls
- Faster response times
- Better recommendations (Spotify's algorithms)
- No database infrastructure needed
