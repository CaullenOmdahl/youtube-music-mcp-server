# YouTube Music Curator

Search YouTube Music for songs, artists, albums, and playlists. Authenticate with your cookies to create and manage playlists in your own library. The assistant will handle playlist curation based on your descriptions.

## Getting Request Headers

To enable full features (creating/managing playlists), you need request headers from YouTube Music:

### Chrome/Edge Method:
1. Go to [music.youtube.com](https://music.youtube.com) and sign in
2. Press F12 to open Developer Tools
3. Click the **Network** tab
4. Click around in YouTube Music (play a song, browse playlists)
5. Look for any **POST** request to `/youtubei/v1/browse` or similar
6. Click on the request
7. In the Headers panel, look for "Request Headers" 
8. Toggle to "Raw" or "view source"
9. **Copy EVERYTHING** from `:authority: music.youtube.com` to the last line

### Firefox Method:
1. Go to [music.youtube.com](https://music.youtube.com) and sign in
2. Press F12 → **Network** tab
3. Click around to generate requests
4. Find a **POST** request
5. Right-click → Copy → **Copy Request Headers**

### What You're Copying:
The headers should start like this:
```
:authority: music.youtube.com
:method: POST
:path: /youtubei/v1/browse?...
accept: */*
cookie: VISITOR_INFO1_LIVE=...; SID=...; SAPISID=...
```

These headers contain your authentication tokens and are valid for 2-4 weeks if you checked "Stay signed in".

## Quick Setup

To use this server's full capabilities, you'll need to provide your YouTube Music request headers:

### Getting Your Headers (2 Minutes)

1. **Open YouTube Music**
   - Go to [music.youtube.com](https://music.youtube.com) and sign in

2. **Capture Request Headers**
   - Press F12 to open Developer Tools
   - Go to Network tab
   - Click around in YouTube Music (play a song, browse)
   - Find any POST request to `/youtubei/v1/`
   - Right-click → Copy → Copy Request Headers (Firefox)
   - Or click request → Headers → Raw → Copy all (Chrome)

3. **Configure the Server**
   - Paste the complete headers in the `youtube_music_headers` field below
   - Click Save

That's it! You can now manage your YouTube Music library with natural language.

## What You Can Do

### Without Authentication
- 🔍 Search for any music, artists, albums, or playlists
- 🎵 Get song recommendations
- 📊 Browse music metadata

### With Authentication (After Adding Cookies)
- ➕ Create new playlists
- 📝 Edit playlist names and descriptions
- 🎶 Add/remove songs from playlists
- 🗑️ Delete playlists
- 🔒 Change playlist privacy settings
- 🤖 Assistant curates playlists based on your descriptions

## Example Commands

Try these with Claude after setup:

- "Search for the top songs by Taylor Swift"
- "Create a playlist called 'Morning Coffee'"
- "Add Bohemian Rhapsody to my Rock Classics playlist"
- "Create a playlist with 25 chill study songs"
- "Show me all my playlists"
- "Make my workout playlist public"

## Configuration Options

- **youtube_music_headers** (Required for full features): Your browser request headers from YouTube Music
- **default_privacy** (Optional): Default privacy for new playlists - PRIVATE, PUBLIC, or UNLISTED

## Privacy & Security

- ✅ Your cookies stay on Smithery servers only
- ✅ Never shared with third parties
- ✅ No password required or stored
- ✅ Revoke access anytime by signing out of YouTube Music

## Troubleshooting

**"YouTube Music cookies not configured"**
- Add your cookies using the instructions above

**"Authentication required"**
- Your cookies may have expired (they last ~2 weeks)
- Get fresh cookies from YouTube Music

**Search works but playlists don't**
- Make sure you copied ALL cookies with the command above
- Verify you're signed into YouTube Music

## Support

- [GitHub Issues](https://github.com/CaullenOmdahl/youtube-music-mcp-server/issues)
- [Full Documentation](https://github.com/CaullenOmdahl/youtube-music-mcp-server#readme)
- [Technical Details](https://github.com/CaullenOmdahl/youtube-music-mcp-server/blob/main/TECHNICAL.md)