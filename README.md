# YouTube Music MCP Server

A Model Context Protocol (MCP) server that integrates YouTube Music functionality with Claude AI. Search for music, generate intelligent playlist suggestions, and create curated playlists based on mood, decade, or natural language descriptions.

## Features

- 🔍 **Search YouTube Music**: Find songs, artists, albums, and playlists
- 🎵 **Smart Playlist Creation**: Generate playlists from natural language descriptions
- 🎨 **Intelligent Curation**: Create mood-based and decade-based playlists
- 🔐 **Authentication Support**: Access library features with YouTube Music cookies
- 🧠 **AI-Powered**: Leverages YouTube Music APIs with intelligent recommendation algorithms

## Available Tools

### `search`
Search YouTube Music for content with customizable filters:
- Query any search term
- Filter by type (songs, artists, albums, playlists, all)
- Limit results (1-50)

### `generate_playlist_suggestions`
Generate curated playlist suggestions:
- **Mood-based**: energetic, chill, focus, party, workout, sleep
- **Decade-based**: 1960s-2020s throwback playlists
- **Duration control**: Target playlist length in minutes
- **Content filtering**: Include/exclude explicit content

### `create_smart_playlist`
Create playlists from natural language descriptions:
- "Upbeat 80s workout music"
- "Chill study background music"
- "Party dance hits from the 2000s"

### Authentication Tools
- `authenticate`: Connect your YouTube Music account using cookies
- `get_auth_status`: Check current authentication status
- `clear_auth`: Remove stored credentials

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