# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an enterprise-grade Model Context Protocol (MCP) server that provides YouTube Music functionality to AI agents through OAuth 2.1 authentication. Built with TypeScript using the MCP SDK, it features HTTP transport, AI-powered adaptive playlist generation using Reccobeats, MusicBrainz, ListenBrainz, and Spotify APIs.

**Key Technology Stack:**
- TypeScript with strict type checking
- MCP SDK for server framework
- Express.js for HTTP server
- Zod for runtime validation
- googleapis for OAuth
- got for HTTP client
- AES-256-GCM for token encryption

## Build and Development Commands

### Standard Development
```bash
npm install              # Install dependencies
npm run build           # Build TypeScript
npm run dev             # Build and run in development
npm run lint            # Lint code with ESLint

# Run the server locally
node dist/index.js

# Run with testing bypass (no OAuth required)
BYPASS_AUTH_FOR_TESTING=true PORT=8084 node dist/index.js
```

### Docker
```bash
docker build -t ytmusic-mcp .
docker run -p 8081:8081 \
  -e GOOGLE_OAUTH_CLIENT_ID="your-client-id" \
  -e GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret" \
  -e ENCRYPTION_KEY="your-encryption-key" \
  ytmusic-mcp
```

### Smithery Deployment
```bash
npm install -g @smithery/cli
smithery deploy
```

## Architecture

### Directory Structure

```
├── src/
│   ├── index.ts              # Entry point, exports OAuth provider
│   ├── server.ts             # MCP server with HTTP transport
│   ├── config.ts             # Configuration management
│   ├── auth/
│   │   ├── smithery-oauth-provider.ts  # Smithery OAuth integration
│   │   └── token-store.ts    # Shared token storage
│   ├── youtube-music/
│   │   ├── client.ts         # YouTube Music API client
│   │   └── parsers.ts        # Response parsers
│   ├── youtube-data/
│   │   └── client.ts         # YouTube Data API v3 client
│   ├── musicbrainz/
│   │   └── client.ts         # MusicBrainz API client
│   ├── listenbrainz/
│   │   └── client.ts         # ListenBrainz API client
│   ├── spotify/
│   │   └── client.ts         # Spotify API client
│   ├── reccobeats/
│   │   └── client.ts         # Reccobeats recommendation API
│   ├── adaptive-playlist/
│   │   ├── types.ts          # Profile and context types
│   │   ├── session-manager.ts # Conversation session management
│   │   ├── recommendation-engine.ts # AI recommendation engine
│   │   ├── song-features.ts  # Audio feature extraction
│   │   └── scoring/          # Modular scoring system
│   ├── tools/
│   │   ├── query.ts          # Search and info tools (7)
│   │   ├── playlist.ts       # Playlist CRUD tools (7)
│   │   ├── adaptive-playlist.ts # Adaptive playlist tools (5)
│   │   ├── reccobeats.ts     # Reccobeats tools (2)
│   │   └── system.ts         # Auth/status tools (2)
│   ├── types/
│   │   └── index.ts          # Zod schemas and types
│   └── utils/
│       ├── logger.ts         # Structured logging
│       └── rate-limiter.ts   # Rate limiting with batching
├── smithery.yaml             # Smithery deployment config
├── Dockerfile                # Container build
└── package.json
```

### Key Architectural Principles

1. **HTTP Transport**: Uses StreamableHTTPServerTransport for MCP protocol
2. **OAuth 2.1 with PKCE**: Proxies to Google OAuth via Smithery
3. **Multi-API Integration**:
   - **YouTube Data API v3** (authenticated): Playlist CRUD, library access with OAuth bearer tokens
   - **YouTube Music API** (unofficial): Search, metadata via cookies/headers  
   - **Reccobeats**: Mood/energy-based music recommendations
   - **MusicBrainz/ListenBrainz**: Metadata enrichment and discovery
   - **Spotify**: Audio features and genre classification
4. **Shared Token Store**: Tokens accessible across OAuth provider and clients
5. **Full Pagination Support**: `get_playlist_details` can fetch entire playlists with `fetch_all=true`
6. **Structured Logging**: All components use consistent logging

## MCP Tools Available (23 total)

### Query Tools (7)
- `search_songs` - Search for songs
- `search_albums` - Search for albums
- `search_artists` - Search for artists
- `get_song_info` - Get song details
- `get_album_info` - Get album with tracks
- `get_artist_info` - Get artist with top songs
- `get_library_songs` - Get user's liked music from YouTube Music (uses LM playlist, music only)

### Playlist Tools (7)
- `get_playlists` - Get user's playlists
- `get_playlist_details` - Get playlist with tracks (supports `fetch_all=true` to get entire playlist)
- `create_playlist` - Create new playlist
- `edit_playlist` - Edit playlist metadata
- `delete_playlist` - Delete playlist
- `add_songs_to_playlist` - Add songs (batch)
- `remove_songs_from_playlist` - Remove songs (batch)

### Adaptive Playlist Tools (5) - AI-Powered Playlist Generation
- `start_playlist_conversation` - Start conversational playlist session
- `continue_conversation` - Continue conversation, extract preferences
- `generate_adaptive_playlist` - Generate AI-curated playlist
- `view_profile` - View extracted user profile
- `decode_playlist_profile` - Decode profile from playlist description

### Reccobeats Tools (2) - Music Recommendation API
- `get_audio_features` - Get valence/energy for tracks
- `get_music_recommendations` - Get mood/seed-based recommendations

### System Tools (2)
- `get_auth_status` - Check authentication status
- `get_server_status` - Get server health metrics

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 2.0 Client ID | Yes | - |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | Yes | - |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI | Yes | - |
| `ENCRYPTION_KEY` | Base64 32-byte key | Yes | - |
| `SPOTIFY_CLIENT_ID` | Spotify API Client ID | No | - |
| `SPOTIFY_CLIENT_SECRET` | Spotify API Client Secret | No | - |
| `PORT` | Server port | No | `8081` |
| `BYPASS_AUTH_FOR_TESTING` | Skip OAuth for testing | No | `false` |

### Testing Configuration
```bash
BYPASS_AUTH_FOR_TESTING=true PORT=8084 node dist/index.js
```

## Smithery Deployment

- Auto-deploys on push to GitHub
- OAuth routes automatically mounted by Smithery
- Configure environment variables in Smithery dashboard
- Redirect URI: `https://server.smithery.ai/@CaullenOmdahl/youtube-music-mcp-server/oauth/callback`

## Playlist Creation Guidelines

**IMPORTANT: When creating playlists (manually or via adaptive tools), follow these rules:**

1. **Never add consecutive same-artist songs** - Distribute songs from the same artist evenly throughout the playlist
2. **Calculate ideal spacing** - If adding N songs from one artist to a playlist of L songs, space them L/N positions apart
3. **Avoid same-album clustering** - Treat multiple songs from the same album like same-artist songs
4. **Consider transitions** - Minimize jarring energy/tempo jumps between adjacent tracks

**When manually building playlists with `add_songs_to_playlist`:**
1. Collect all songs first
2. Group by artist to see distribution
3. Reorder to distribute same-artist songs evenly
4. Add songs in the reordered sequence

**When using adaptive playlist tools:**
- The `generate_adaptive_playlist` tool handles reordering automatically
- Trust the algorithm - it uses research-backed distribution

See `PLAYLIST_GUIDELINES.md` for detailed examples and research references.

## Important Notes

- **OAuth Tokens**: Never commit or log tokens/secrets
- **Type Safety**: Strict TypeScript - no `any` without justification
- **MusicBrainz Rate Limit**: MusicBrainz has a strict 1 req/sec limit (enforced in code)
- **.env files**: Never commit - use Smithery config for deployment
