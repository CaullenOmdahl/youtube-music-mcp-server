# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an enterprise-grade Model Context Protocol (MCP) server that provides YouTube Music functionality to AI agents through OAuth 2.1 authentication. Built with TypeScript using the MCP SDK, it features HTTP transport, smart playlist creation using MusicBrainz and ListenBrainz, and comprehensive rate limiting.

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
│   ├── musicbrainz/
│   │   └── client.ts         # MusicBrainz API client
│   ├── listenbrainz/
│   │   └── client.ts         # ListenBrainz API client
│   ├── recommendations/
│   │   ├── engine.ts         # Recommendation engine
│   │   └── session.ts        # Playlist session management
│   ├── tools/
│   │   ├── query.ts          # Search and info tools (7)
│   │   ├── playlist.ts       # Playlist CRUD tools (7)
│   │   ├── smart-playlist.ts # Smart playlist tools (8)
│   │   └── system.ts         # Auth/status tools (2)
│   ├── types/
│   │   └── index.ts          # Zod schemas and types
│   └── utils/
│       ├── logger.ts         # Structured logging
│       └── rate-limiter.ts   # Rate limiting
├── smithery.yaml             # Smithery deployment config
├── Dockerfile                # Container build
└── package.json
```

### Key Architectural Principles

1. **HTTP Transport**: Uses StreamableHTTPServerTransport for MCP protocol
2. **OAuth 2.1 with PKCE**: Proxies to Google OAuth via Smithery
3. **Dual API Strategy**:
   - **YouTube Data API v3** (authenticated): Playlist CRUD, library access with OAuth bearer tokens
   - **YouTube Music API** (public): Search, metadata via public endpoints
4. **Shared Token Store**: Tokens accessible across OAuth provider and clients
5. **Rate Limiting**: Per-session and global rate limits
6. **Structured Logging**: All components use consistent logging

## MCP Tools Available (24 total)

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
- `get_playlist_details` - Get playlist with tracks
- `create_playlist` - Create new playlist
- `edit_playlist` - Edit playlist metadata
- `delete_playlist` - Delete playlist
- `add_songs_to_playlist` - Add songs (batch)
- `remove_songs_from_playlist` - Remove songs (batch)

### Smart Playlist Tools (8)
- `start_smart_playlist` - Start playlist session
- `add_seed_artist` - Add artist for recommendations
- `add_seed_track` - Add track for recommendations
- `refine_recommendations` - Adjust parameters
- `get_recommendations` - Generate recommendations
- `preview_playlist` - Preview before creating
- `create_smart_playlist` - Create on YouTube Music
- `get_user_taste_profile` - Analyze user's taste

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
| `RATE_LIMIT_PER_MINUTE` | Rate limit per minute | No | `60` |
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

## Important Notes

- **OAuth Tokens**: Never commit or log tokens/secrets
- **Type Safety**: Strict TypeScript - no `any` without justification
- **Rate Limiting**: Respect YouTube API quotas
- **.env files**: Never commit - use Smithery config for deployment
