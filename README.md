# YouTube Music MCP Server for Smithery

A powerful MCP server that connects to YouTube Music, enabling search, playlist management, and music curation directly through Claude or any MCP client.

## Features

- 🔍 **Search** - Find songs, artists, albums, playlists
- 📚 **Library Management** - Access and manage your playlists
- ➕ **Playlist Operations** - Create, edit, delete playlists
- 🎵 **Song Management** - Add/remove songs from playlists
- 🤖 **Smart Playlists** - Create playlists from natural language descriptions
- 🔐 **Simple Authentication** - Just paste your cookies, no complex setup

## How to Get Your YouTube Music Cookies

1. Go to [YouTube Music](https://music.youtube.com) and sign in
2. Open Developer Tools (F12)
3. Go to **Application** tab → **Cookies** → `https://music.youtube.com`
4. Select all cookies (Ctrl+A) and copy them
5. Format them as a single string separated by `; `

The cookie string should contain all cookies from music.youtube.com, including:
- VISITOR_INFO1_LIVE
- SID, HSID, SSID
- APISID, SAPISID
- And other session cookies

## Configuration

When connecting to this server, you'll need to provide:

- **youtube_music_cookies** (required): Your YouTube Music cookies
- **default_privacy** (optional): Default privacy for new playlists (PRIVATE, PUBLIC, or UNLISTED)

## Available Tools

### Search (No Auth Required)
- `search_music` - Search YouTube Music for any content

### Playlist Management (Auth Required)
- `get_library_playlists` - Get all your playlists
- `get_playlist` - Get detailed info about a specific playlist
- `create_playlist` - Create a new playlist
- `add_songs_to_playlist` - Add songs to a playlist
- `remove_songs_from_playlist` - Remove songs from a playlist
- `delete_playlist` - Delete a playlist
- `edit_playlist` - Edit playlist title, description, or privacy

### Smart Features
- `create_smart_playlist` - Create a playlist from a description like "upbeat 90s workout music"
- `get_auth_status` - Check your authentication status

## Usage Examples

### Search for Music
```
Search for "The Beatles" songs on YouTube Music
```

### Create a Playlist
```
Create a playlist called "Summer Vibes 2025" with chill beach music
```

### Smart Playlist Creation
```
Create a smart playlist: "energetic 2000s pop punk for working out"
```

## Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
# or with uv
uv sync
```

2. Run the development server:
```bash
uv run dev
# or test in playground
uv run playground
```

## Deployment on Smithery

1. Push this code to a GitHub repository
2. Go to [Smithery](https://smithery.ai/new)
3. Connect your GitHub and deploy
4. Users can configure their own cookies when connecting

## Security Notes

- Cookies are handled per-session (each user uses their own)
- Never share your cookies publicly
- Cookies expire after ~2 years or when you log out
- The server only accesses YouTube Music, nothing else

## Requirements

- Python 3.10+
- ytmusicapi
- mcp
- smithery

## License

MIT