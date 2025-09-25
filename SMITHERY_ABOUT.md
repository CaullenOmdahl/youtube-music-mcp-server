# YouTube Music Curator

Search YouTube Music for songs, artists, albums, and playlists. Authenticate with your cookies to create and manage playlists in your own library. The assistant will handle playlist curation based on your descriptions.

## Quick Setup

To use this server's full capabilities, you'll need to provide your YouTube Music cookies:

### Getting Your Cookies (2 Minutes)

1. **Open YouTube Music**
   - Go to [music.youtube.com](https://music.youtube.com) and sign in

2. **Copy Your Cookies**
   - Press F12 to open Developer Tools
   - Go to Console tab
   - Paste this command and press Enter:
   ```javascript
   copy(document.cookie)
   ```

3. **Configure the Server**
   - Paste the copied string in the `youtube_music_cookies` field below
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

- **youtube_music_cookies** (Required for full features): Your browser cookies from YouTube Music
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