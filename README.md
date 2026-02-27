# YouTube Music MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

MCP server for YouTube Music — search songs, manage playlists, and get AI-powered recommendations through Claude Desktop or any MCP-compatible client.

## How it works

The server runs as a **stdio process** launched directly by Claude Desktop. It communicates via stdin/stdout using the MCP protocol — no port, no separate server to keep running.

```
Claude Desktop → spawns → node dist/index.js → talks to YouTube Music APIs
```

Authentication is handled separately via a one-time OAuth flow (`npm run auth`). The resulting tokens are saved to disk and loaded automatically on every start.

## Prerequisites

- Node.js 20+
- A Google Cloud project with **YouTube Data API v3** enabled
- A Google OAuth 2.0 client (Desktop app type)
- Your Google account added as a **Test User** in the OAuth consent screen

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
ENCRYPTION_KEY=                  # generate with: openssl rand -base64 32
```

> **Note:** `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are optional. They enable audio feature analysis (tempo, energy, valence). The server works without them.

### 3. Build

```bash
npm run build
```

### 4. Authenticate with Google (one time)

```bash
npm run auth
```

This opens your browser, you log in with Google, and the tokens are saved to `~/.youtube-music-mcp/tokens.json`. You only need to do this once — the refresh token keeps the session alive.

> **If you see "Error 403: access_denied":** Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → OAuth consent screen → Test users → add your Google email.

### 5. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "youtube-music": {
      "command": "node",
      "args": ["/absolute/path/to/youtube-music-mcp-server/dist/index.js"],
      "env": {
        "GOOGLE_OAUTH_CLIENT_ID": "your-client-id",
        "GOOGLE_OAUTH_CLIENT_SECRET": "your-client-secret",
        "ENCRYPTION_KEY": "your-encryption-key",
        "BYPASS_AUTH_FOR_TESTING": "true",
        "TOKEN_STORAGE_PATH": "/Users/your-user/.youtube-music-mcp/tokens.json"
      }
    }
  }
}
```

### 6. Restart Claude Desktop

The server starts automatically when Claude Desktop launches.

---

## Tools (23 total)

### Search & Discovery — no auth required

| Tool | Description |
|------|-------------|
| `search_songs` | Search songs by name, lyrics, or artist |
| `search_albums` | Search albums |
| `search_artists` | Search artists |
| `get_song_info` | Detailed song metadata |
| `get_album_info` | Album with full tracklist |
| `get_artist_info` | Artist with top songs |

### Library & Playlists — requires Google auth

| Tool | Description |
|------|-------------|
| `get_library_songs` | Your liked songs from YouTube Music |
| `get_playlists` | All your playlists |
| `get_playlist_details` | Playlist tracks (supports `fetch_all=true`) |
| `create_playlist` | Create a new playlist |
| `edit_playlist` | Rename or change description |
| `delete_playlist` | Delete a playlist |
| `add_songs_to_playlist` | Add songs in batch |
| `remove_songs_from_playlist` | Remove songs in batch |

### Adaptive Playlists — AI-powered

| Tool | Description |
|------|-------------|
| `start_playlist_conversation` | Start a session to gather preferences |
| `continue_conversation` | Keep refining preferences |
| `generate_adaptive_playlist` | Generate a curated playlist |
| `view_profile` | See your extracted taste profile |
| `decode_playlist_profile` | Decode profile from a playlist description |

### Recommendations

| Tool | Description |
|------|-------------|
| `get_audio_features` | Get valence/energy/tempo for tracks (via Reccobeats) |
| `get_music_recommendations` | Mood and seed-based recommendations |

### System

| Tool | Description |
|------|-------------|
| `get_auth_status` | Check if Google auth is active |
| `get_server_status` | Server health and uptime |

---

## Workflow Prompts

The server includes 5 built-in prompts accessible from Claude:

- **Search Songs & Create Playlist** — find songs by theme and build a playlist
- **Discover Artist** — explore an artist's discography
- **Manage Playlist** — view, add to, or reorganize a playlist
- **Smart Recommendations** — get mood-based recommendations
- **Browse My Library** — overview of your liked songs and playlists

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | Google OAuth 2.0 Client Secret |
| `ENCRYPTION_KEY` | Yes | Base64 32-byte key for token storage (`openssl rand -base64 32`) |
| `TOKEN_STORAGE_PATH` | No | Where to store OAuth tokens (default: `~/.youtube-music-mcp/tokens.json`) |
| `SPOTIFY_CLIENT_ID` | No | Spotify Client ID (enables audio features) |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify Client Secret |
| `DATABASE_URL` | No | PostgreSQL URL (enables adaptive playlist memory) |
| `BYPASS_AUTH_FOR_TESTING` | No | Set `true` to skip MCP-level OAuth (needed for Claude Desktop stdio mode) |
| `PORT` | No | HTTP server port (default: `8081`, only used in `npm run dev`) |

---

## Development

```bash
npm run dev      # HTTP server mode on port 8081 (for Smithery / web clients)
npm run auth     # Run the local OAuth flow once
npm run build    # Compile TypeScript
npm run test     # Run tests
npm run lint     # Lint
```

### Two transport modes

| Mode | Command | Use case |
|------|---------|----------|
| **stdio** | `node dist/index.js` | Claude Desktop — spawned as subprocess |
| **HTTP** | `npm run dev` | Smithery, web clients, remote deployment |

---

## Google Cloud Setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **YouTube Data API v3**
3. Create an OAuth 2.0 credential — type **Desktop app**
4. In **OAuth consent screen** → add your Google email under **Test users**
5. Download the credentials JSON and copy `client_id` and `client_secret` to `.env`

---

## Architecture

```
src/
├── index.ts                    # Smithery + stdio entry point
├── main.ts                     # HTTP server entry point (npm run dev)
├── server.ts                   # Express + MCP HTTP server
├── config.ts                   # Environment variable validation (Zod)
├── auth/
│   ├── smithery-oauth-provider.ts  # Google OAuth proxy for HTTP mode
│   └── token-store.ts          # Encrypted token persistence
├── youtube-music/
│   ├── client.ts               # InnerTube API client (search, library)
│   └── parsers.ts              # Response parsers
├── youtube-data/
│   └── client.ts               # YouTube Data API v3 (playlists)
├── musicbrainz/ listenbrainz/ spotify/ reccobeats/
│   └── client.ts               # Third-party API clients
├── adaptive-playlist/          # AI playlist generation engine
├── recommendations/            # Seed-based recommendation engine
├── tools/
│   ├── query.ts                # Search tools
│   ├── playlist.ts             # Playlist CRUD tools
│   ├── adaptive-playlist.ts    # Adaptive playlist tools
│   ├── reccobeats.ts           # Recommendation tools
│   ├── system.ts               # Auth/status tools
│   └── prompts.ts              # Workflow prompts
└── utils/
    ├── logger.ts               # Winston logger (writes to stderr)
    └── rate-limiter.ts         # Request batching and rate limiting
scripts/
└── auth.ts                     # Local OAuth flow (npm run auth)
```

---

## Links

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [ListenBrainz](https://listenbrainz.org/) — open music recommendations
- [MusicBrainz](https://musicbrainz.org/) — open music database
- [Reccobeats](https://reccobeats.com/) — mood-based recommendations

## License

MIT
