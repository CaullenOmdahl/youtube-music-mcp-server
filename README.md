# YouTube Music MCP Server (TypeScript)

Enterprise-grade Model Context Protocol (MCP) server for YouTube Music with smart playlist creation using MusicBrainz and ListenBrainz.

## Features

- **Full Playlist CRUD**: Create, read, update, delete playlists with batch operations
- **Smart Playlists**: AI-driven playlist creation using unbiased recommendations from ListenBrainz
- **Rich Metadata**: All responses include song, album, artist, and year
- **LLM Autonomy**: Designed for AI agents to fully control playlist management
- **OAuth 2.1 + PKCE**: Secure authentication with encrypted token storage
- **Rate Limiting**: Configurable limits to respect API quotas

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Testing (no OAuth)

```bash
BYPASS_AUTH_FOR_TESTING=true npm run dev
```

## MCP Tools

### Query Tools
- `search_songs` - Search for songs with configurable limits
- `search_albums` - Search for albums
- `search_artists` - Search for artists
- `get_song_info` - Get detailed song information
- `get_album_info` - Get album with all tracks
- `get_artist_info` - Get artist with top songs
- `get_library_songs` - Get user's liked music (YouTube Music only, filters out non-music videos)

### Playlist CRUD
- `get_playlists` - Get user's playlists
- `get_playlist_details` - Get playlist with all tracks
- `create_playlist` - Create new playlist
- `edit_playlist` - Update playlist metadata
- `delete_playlist` - Delete playlist
- `add_songs_to_playlist` - Batch add songs
- `remove_songs_from_playlist` - Batch remove songs

### Smart Playlist
- `start_smart_playlist` - Begin playlist creation session
- `add_seed_artist` - Add artist to influence recommendations
- `add_seed_track` - Add track as seed
- `refine_recommendations` - Set preferences (exclude, tags, diversity)
- `get_recommendations` - Generate recommendations
- `preview_playlist` - Preview before creating
- `create_smart_playlist` - Create on YouTube Music
- `get_user_taste_profile` - Analyze user's music taste

### System
- `get_auth_status` - Check authentication
- `get_server_status` - Server health and metrics

## Response Format

All tools return structured JSON:

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

## Docker

```bash
docker build -t youtube-music-mcp .
docker run -p 8081:8081 \
  -e GOOGLE_OAUTH_CLIENT_ID="..." \
  -e GOOGLE_OAUTH_CLIENT_SECRET="..." \
  youtube-music-mcp
```

## Smithery Deployment

```bash
npm install -g @smithery/cli
smithery deploy
```

## Architecture

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server setup
├── config.ts             # Environment config
├── youtube-music/        # Custom YouTube Music client
│   ├── client.ts         # API methods
│   └── parsers.ts        # Response parsing
├── musicbrainz/          # MusicBrainz client
├── listenbrainz/         # ListenBrainz client
├── recommendations/      # Smart playlist engine
│   ├── engine.ts         # Recommendation logic
│   └── session.ts        # Session management
├── auth/                 # OAuth 2.1 + PKCE
├── tools/                # MCP tool definitions
│   ├── query.ts          # Search tools
│   ├── playlist.ts       # CRUD tools
│   ├── smart-playlist.ts # Smart playlist tools
│   └── system.ts         # Status tools
└── types/                # TypeScript interfaces
```

## License

MIT
