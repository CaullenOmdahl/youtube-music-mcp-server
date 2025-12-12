# YouTube Music MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

**Full-featured MCP server for YouTube Music** — search, manage playlists, and create smart recommendations through AI assistants.

## Highlights

- **Complete Playlist Control** — Create, edit, delete playlists with batch operations
- **Smart Recommendations** — AI-driven playlist creation using ListenBrainz (unbiased, no payola)
- **Rich Metadata** — Every response includes artist, album, year, and duration
- **Secure Auth** — OAuth 2.1 + PKCE with encrypted token storage
- **Rate Limited** — Configurable limits to respect API quotas

## Quick Start

```bash
npm install
cp .env.example .env
# Add your Google OAuth credentials to .env
npm run build
npm start
```

### MCP Configuration

```json
{
  "mcpServers": {
    "youtube-music": {
      "command": "node",
      "args": ["path/to/youtube-music-mcp-server/dist/index.js"],
      "env": {
        "GOOGLE_OAUTH_CLIENT_ID": "your-client-id",
        "GOOGLE_OAUTH_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Tools

### Search & Discovery
| Tool | Description |
|------|-------------|
| `search_songs` | Search songs with configurable limits |
| `search_albums` | Search albums |
| `search_artists` | Search artists |
| `get_song_info` | Detailed song information |
| `get_album_info` | Album with all tracks |
| `get_artist_info` | Artist with top songs |
| `get_library_songs` | User's liked music (filters non-music) |

### Playlist Management
| Tool | Description |
|------|-------------|
| `get_playlists` | List user's playlists |
| `get_playlist_details` | Playlist with all tracks |
| `create_playlist` | Create new playlist |
| `edit_playlist` | Update metadata |
| `delete_playlist` | Delete playlist |
| `add_songs_to_playlist` | Batch add songs |
| `remove_songs_from_playlist` | Batch remove songs |

### Smart Playlists
| Tool | Description |
|------|-------------|
| `start_smart_playlist` | Begin creation session |
| `add_seed_artist` | Add artist influence |
| `add_seed_track` | Add track as seed |
| `refine_recommendations` | Set preferences (exclude, tags, diversity) |
| `get_recommendations` | Generate recommendations |
| `preview_playlist` | Preview before creating |
| `create_smart_playlist` | Create on YouTube Music |
| `get_user_taste_profile` | Analyze listening habits |

## Response Format

All tools return structured JSON with metadata:

```json
{
  "songs": [{
    "videoId": "abc123",
    "title": "Song Title",
    "artists": [{"id": "...", "name": "Artist"}],
    "album": {"id": "...", "name": "Album", "year": 2023},
    "duration": "3:45",
    "durationSeconds": 225
  }],
  "metadata": {
    "returned": 20,
    "hasMore": true
  }
}
```

## Example Workflows

**"Make me a playlist based on Radiohead and Boards of Canada"**
```
→ start_smart_playlist()
→ add_seed_artist("Radiohead")
→ add_seed_artist("Boards of Canada")
→ get_recommendations()
→ create_smart_playlist("Late Night Electronica")
```

**"Add these songs to my workout playlist"**
```
→ search_songs("high energy workout")
→ add_songs_to_playlist(playlistId, [videoId1, videoId2, ...])
```

## Architecture

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server setup
├── youtube-music/        # Custom YTM client
│   ├── client.ts         # API methods
│   └── parsers.ts        # Response parsing
├── musicbrainz/          # MusicBrainz integration
├── listenbrainz/         # ListenBrainz recommendations
├── recommendations/      # Smart playlist engine
├── auth/                 # OAuth 2.1 + PKCE
└── tools/                # MCP tool definitions
```

## Docker

```bash
docker build -t youtube-music-mcp .
docker run -p 8081:8081 \
  -e GOOGLE_OAUTH_CLIENT_ID="..." \
  -e GOOGLE_OAUTH_CLIENT_SECRET="..." \
  youtube-music-mcp
```

## Development

```bash
npm run dev                           # Development mode
BYPASS_AUTH_FOR_TESTING=true npm run dev  # Skip OAuth for testing
```

## Links

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [ListenBrainz](https://listenbrainz.org/) — Open music recommendations
- [MusicBrainz](https://musicbrainz.org/) — Open music database

## License

MIT
