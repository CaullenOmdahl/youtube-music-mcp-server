# YouTube Music MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to interact with YouTube Music. Search for music, manage playlists, and control your YouTube Music library through natural language commands.

## Features

- 🔍 **Search** - Search for songs, albums, artists, playlists, and videos
- 📋 **Playlist Management** - Create, edit, delete, and manage playlists
- 🎵 **Library Access** - Access and modify your personal YouTube Music library

- 🔐 **Secure Authentication** - Cookie-based authentication keeps your credentials safe

## Installation

### Via Smithery (Recommended)

The easiest way to use this server is through [Smithery](https://smithery.ai/):

1. Visit the [YouTube Music MCP Server on Smithery](https://smithery.ai/server/@CaullenOmdahl/youtube-music-mcp-server)
2. Click "Install" to add it to your MCP client
3. Configure your YouTube Music cookies (see [Getting Your Cookies](#getting-your-cookies))

### Local Installation

```bash
# Clone the repository
git clone https://github.com/CaullenOmdahl/youtube-music-mcp-server.git
cd youtube-music-server

# Install dependencies
pip install -e .

# Run the server
python -m ytmusic_server
- 
## Getting Your Cookies

To use authenticated features (playlist management, library access), you need to provide your YouTube Music cookies. Here's how:

### Method 1: Browser Developer Tools (Recommended)

1. Open [YouTube Music](https://music.youtube.com) in your browser
2. Sign in to your account
3. Open Developer Tools (F12 or right-click → "Inspect")
4. Go to the "Application" tab (Chrome/Edge) or "Storage" tab (Firefox)
5. In the sidebar, expand "Cookies" and click on `https://music.youtube.com`
6. Find and copy the values of these cookies:
   - `VISITOR_INFO1_LIVE`
   - `PREF`
   - `LOGIN_INFO` 
   - `SAPISID`
   - `__Secure-3PAPISID`
   - `__Secure-3PSID`
   - `APISID`
   - `HSID`
   - `SID`
   - `SSID`
   - `SIDCC`
   - `__Secure-3PSIDCC`
   - `YSC`
   - `SOCS`

7. Format them as a cookie string:
```
VISITOR_INFO1_LIVE=xxxxx; PREF=xxxxx; LOGIN_INFO=xxxxx; SAPISID=xxxxx; ...
```

### Method 2: Browser Extension

Use extensions like [EditThisCookie](https://www.editthiscookie.com/) or [Cookie-Editor](https://cookie-editor.cgagnier.ca/) to export cookies in the correct format.

### Method 3: Using a Cookie Export Script

```javascript
// Run this in the browser console on music.youtube.com
copy(document.cookie)
- And other session cookies

## Configuration

### For Smithery Users

After installing the server on Smithery, configure it with your cookies:

1. Click on the server settings in your MCP client
2. Paste your cookie string in the `youtube_music_cookies` field
3. Optionally set `default_privacy` to `PRIVATE`, `PUBLIC`, or `UNLISTED`
4. Save the configuration

### For Local Installation

Create a configuration file or set environment variables:

```json
{
  "youtube_music_cookies": "YOUR_COOKIE_STRING_HERE",
  "default_privacy": "PRIVATE"
}
```

## Available Tools

### Search Music
Search YouTube Music for content without authentication.

```
search_music(query, filter?, limit?)
```
- `query`: Search terms
- `filter`: Optional - 'songs', 'videos', 'albums', 'artists', 'playlists', 'uploads'
- `limit`: Maximum results (default: 20)

### Get Library Playlists
Get all playlists from your library (requires auth).

```
get_library_playlists()
```

### Get Playlist
Get detailed information about a specific playlist.

```
get_playlist(playlist_id)
```

### Create Playlist
Create a new playlist in your library.

```
create_playlist(title, description?, privacy?)
```

### Add Songs to Playlist
Add songs to an existing playlist.

```
add_songs_to_playlist(playlist_id, video_ids)
```

### Remove Songs from Playlist
Remove songs from a playlist.

```
remove_songs_from_playlist(playlist_id, videos)
```

### Delete Playlist
Delete a playlist from your library.

```
delete_playlist(playlist_id)
```

### Edit Playlist
Edit playlist metadata.

```
edit_playlist(playlist_id, title?, description?, privacy?)
```



## Usage Examples

### With Claude Desktop

Once configured, you can use natural language commands:

- "Search for songs by The Beatles"
- "Create a new playlist called 'Workout Mix'"
- "Add the top 5 songs by Dua Lipa to my Summer Vibes playlist"
- "Create a playlist called 'Study Jazz' and add relaxing jazz songs"
- "Show me all my playlists"
- "Delete my old test playlist"

### With Python Client

```python
from mcp_client import MCPClient

client = MCPClient("youtube-music-server")

# Search for music
results = client.call_tool("search_music", {
    "query": "Bohemian Rhapsody",
    "filter": "songs"
})

# Create a playlist
playlist = client.call_tool("create_playlist", {
    "title": "My Awesome Playlist",
    "description": "Songs I love",
    "privacy": "PRIVATE"
})

# Add songs to playlist
client.call_tool("add_songs_to_playlist", {
    "playlist_id": playlist["playlist_id"],
    "video_ids": ["videoId1", "videoId2"]
})
```

## Privacy & Security

- **Cookie Security**: Your cookies are stored locally and never transmitted to third parties
- **Session Isolation**: Each session has its own authentication context
- **No Password Storage**: We never store or ask for your Google password
- **Revocable Access**: You can revoke access anytime by signing out of YouTube Music

## Troubleshooting

### "YouTube Music cookies not configured"
- Ensure you've provided your cookie string in the configuration
- Check that your cookies haven't expired (sign in to YouTube Music again)
- Verify all required cookies are included

### "Authentication required"
- Some features require authentication even with cookies
- Try refreshing your cookies from YouTube Music

### Search works but playlists don't
- Playlist operations require valid authentication cookies
- Ensure you're signed in to YouTube Music in your browser
- Check that your cookies include `SAPISID` and login tokens

### Cookies expire frequently
- YouTube Music cookies typically last 2 weeks
- Sign in with "Remember me" checked for longer-lasting cookies
- Update cookies when you see authentication errors

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

- Built with [ytmusicapi](https://github.com/sigma67/ytmusicapi) by sigma67
- Implements the [Model Context Protocol](https://modelcontextprotocol.io/)
- Deployable via [Smithery](https://smithery.ai/)

## Support

For issues, questions, or suggestions:
- Open an issue on [GitHub](https://github.com/CaullenOmdahl/youtube-music-mcp-server/issues)
- Check existing issues for solutions

## Disclaimer

This project is not affiliated with, endorsed by, or connected to YouTube, YouTube Music, or Google. Use at your own risk and in accordance with YouTube's Terms of Service.