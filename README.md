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

Configure the server through `smithery.yaml`:

```yaml
config:
  debug: true/false          # Enable debug logging
  cookies: "your_cookies"    # YouTube Music authentication cookies
```

## Authentication

To access library features and create actual playlists, you'll need to authenticate:

1. Log into [music.youtube.com](https://music.youtube.com) in your browser
2. Copy the cookie string from your browser's developer tools
3. Use the `authenticate` tool or add to your configuration

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