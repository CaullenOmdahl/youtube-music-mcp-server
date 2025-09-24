# YouTube Music MCP Server

A Model Context Protocol (MCP) server that integrates YouTube Music functionality with Claude AI. Search for music, generate intelligent playlist suggestions, and create curated playlists based on mood, decade, or natural language descriptions.

**10 Tools Available**: `search`, `generate_playlist_suggestions`, `create_smart_playlist`, `create_playlist`, `add_songs_to_playlist`, `get_my_playlists`, `get_playlist`, `authenticate`, `get_auth_status`, `clear_auth`

## Features

- 🔍 **Search YouTube Music**: Find songs, artists, albums, and playlists
- 🎵 **Smart Playlist Creation**: Generate and save playlists from natural language descriptions
- 🎨 **Intelligent Curation**: Create mood-based and decade-based playlists
- 💾 **Direct Playlist Saving**: Create actual playlists in your YouTube Music account
- 📋 **Playlist Management**: View, modify, and organize your YouTube Music library
- 🔐 **Full Authentication**: Complete access to your YouTube Music account features
- 🧠 **AI-Powered**: Leverages YouTube Music APIs with intelligent recommendation algorithms

## Tools

This server provides the following MCP tools:

### search
Search YouTube Music for songs, artists, albums, or playlists
- **Parameters**: query (string), type (songs/artists/albums/playlists/all), limit (1-50)
- **Returns**: Formatted search results with titles, artists, durations, and IDs

### generate_playlist_suggestions
Generate curated playlist suggestions based on mood or decade with optional auto-save
- **Parameters**: mood (energetic/chill/focus/party/workout/sleep), decade (1960-2020), durationMinutes, includeExplicit, saveFirstSuggestion, privacy
- **Returns**: Multiple playlist suggestions with reasoning and track lists, optionally saved to your account

### create_smart_playlist
Create playlists from natural language descriptions and save to your YouTube Music account
- **Parameters**: description (string), targetLength (number, default 25), saveToAccount (boolean, default true), playlistTitle (optional), privacy
- **Returns**: Smart playlist with curated tracks, automatically saved to your YouTube Music library
- **Examples**: "Upbeat 80s workout music", "Chill study background music"

### create_playlist
Create a new playlist in your YouTube Music account
- **Parameters**: title (string), description (optional), privacy (PUBLIC/PRIVATE/UNLISTED), songIds (optional array)
- **Returns**: Created playlist with ID and URL, ready to access in your YouTube Music library

### add_songs_to_playlist
Add songs to an existing playlist in your YouTube Music account
- **Parameters**: playlistId (string), songIds (array of video IDs)
- **Returns**: Confirmation of songs added to the specified playlist

### get_my_playlists
List all playlists in your YouTube Music library
- **Parameters**: none
- **Returns**: Complete list of your playlists with titles, descriptions, track counts, and IDs

### get_playlist
Get detailed information about a specific playlist including all its songs
- **Parameters**: playlistId (string), limit (number, default 100)
- **Returns**: Playlist details and complete track listing with metadata

### authenticate
Authenticate with YouTube Music using cookies
- **Parameters**: cookies (string)
- **Returns**: Authentication success/failure status

### get_auth_status
Check current YouTube Music authentication status
- **Parameters**: none
- **Returns**: Authentication status and credential verification

### clear_auth
Clear stored YouTube Music authentication credentials
- **Parameters**: none
- **Returns**: Confirmation of credential removal

## Configuration

⚠️ **Authentication Required**: This server requires YouTube Music cookies to function.

Configure the server through `smithery.yaml`:

```yaml
config:
  debug: true/false          # Enable debug logging
  cookies: "your_cookies"    # YouTube Music authentication cookies (REQUIRED)
```

## Authentication Setup

**Required**: You must provide YouTube Music cookies for the server to work:

1. Log into [music.youtube.com](https://music.youtube.com) in your browser
2. Copy the cookie string from your browser's developer tools (see detailed steps below)
3. Add the cookies to your Smithery server configuration

### Getting YouTube Music Cookies

**Method 1: Google Chrome Developer Tools (Recommended)**

1. **Open YouTube Music**
   - Go to [music.youtube.com](https://music.youtube.com) in Google Chrome
   - Make sure you're logged into your Google account

2. **Open Developer Tools**
   - Right-click anywhere on the page → **"Inspect"**
   - Or press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Opt+I` (Mac)
   - Or press `F12`

3. **Navigate to Network Tab**
   - Click the **"Network"** tab at the top of Developer Tools
   - If you don't see it, click the `>>` arrows to find more tabs

4. **Capture Network Requests**
   - With Network tab open, refresh the page (`F5` or `Ctrl+R`)
   - Or search for something in YouTube Music
   - You'll see network requests appearing in the list

5. **Find YouTube Music Request**
   - Look for requests with **Name** starting with:
     - `music.youtube.com`
     - `youtubei/v1/`
     - `browse` or `search`
   - Click on any of these requests

6. **Copy Cookie Header**
   - In the request details, find the **"Request Headers"** section
   - Scroll down to find the line that starts with `Cookie:`
   - **Right-click** on the cookie value → **"Copy value"**
   - Or select all the text after `Cookie:` and copy it

7. **Verify Cookie Format**
   - Your copied cookie should look like:
   ```
   __Secure-1PSID=g.a000abc123...; __Secure-1PAPISID=def456...; SAPISID=ghi789...; HSID=jkl012...
   ```
   - It should be one long line with semicolons separating different cookie values

**Method 2: Chrome Application Tab (Alternative)**

1. **Open YouTube Music** and log in
2. **Open Developer Tools** (`F12`)
3. **Go to Application Tab**
   - Click **"Application"** tab (may be under `>>` if hidden)
4. **Navigate to Cookies**
   - In left sidebar, expand **"Cookies"**
   - Click on **"https://music.youtube.com"**
5. **Copy Cookie Values**
   - You'll see individual cookies in a table
   - Copy the **Value** column for each cookie
   - Format them as: `name1=value1; name2=value2; name3=value3`

**Method 3: Browser Extension (Easiest)**
1. Install **"Cookie Editor"** extension from Chrome Web Store
2. Go to YouTube Music and log in
3. Click the Cookie Editor extension icon
4. Select **"Export"** → **"Header String"** for `music.youtube.com`
5. Copy the formatted cookie string

**Cookie Format Example:**
```
__Secure-1PSID=g.a000...; __Secure-1PAPISID=abc123...; SAPISID=def456...; HSID=xyz789...
```

⚠️ **Security**: Keep your cookies secure - they're like passwords for your account.

## Development

Built with:
- **TypeScript** for type safety
- **Zod** for schema validation
- **ytmusic-api** and **youtube-music-ts-api** for YouTube Music integration
- **@modelcontextprotocol/sdk** for MCP compliance

## Deployment

Deploy to Smithery:
1. Create a GitHub repository with this code
2. Connect to Smithery
3. Configure your authentication cookies
4. Deploy and connect to Claude

## Usage Examples

**Search for music:**
```
Search for "The Beatles" in all categories with limit 5
```

**Generate mood-based playlist:**
```
Generate workout playlist suggestions for 45 minutes, exclude explicit content
```

**Create smart playlist:**
```
Create a smart playlist: "Chill indie rock for studying"
```

**Check authentication:**
```
Get authentication status
```

## License

MIT License