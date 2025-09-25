# Technical Documentation - YouTube Music MCP Server

## Architecture Overview

This server implements the Model Context Protocol (MCP) to provide YouTube Music functionality to LLMs. It acts as a bridge between language models and the YouTube Music API, handling authentication, API calls, and data transformation.

```
┌─────────────┐     MCP Protocol     ┌──────────────┐     HTTPS/API     ┌──────────────┐
│     LLM     │◄──────────────────────►│  MCP Server  │◄─────────────────►│YouTube Music │
│  (Claude)   │    JSON-RPC 2.0       │  (This app)  │   ytmusicapi      │   Backend    │
└─────────────┘                       └──────────────┘                   └──────────────┘
```

## Core Components

### 1. Authentication System

#### Cookie-Based Authentication

YouTube Music uses cookie-based authentication rather than OAuth2. The authentication flow:

1. **Cookie Collection**: User provides cookies from an authenticated browser session
2. **Header Construction**: Server builds required HTTP headers from cookies
3. **SAPISIDHASH Generation**: Creates time-based authentication hash
4. **Session Management**: Maintains authenticated YTMusic instances per session

#### Key Authentication Code

```python
def generate_sapisidhash(sapisid: str, origin: str = "https://music.youtube.com") -> str:
    """Generate SAPISIDHASH for YouTube API authentication"""
    time_msec = int(time.time())
    auth_string = f"{time_msec} {sapisid} {origin}"
    auth_hash = hashlib.sha1(auth_string.encode()).hexdigest()
    return f"{time_msec}_{auth_hash}"
```

#### Required Cookies

The following cookies are essential for authentication:

- **SAPISID**: Used to generate SAPISIDHASH for API authentication
- **__Secure-3PAPISID**: Alternative SAPISID for secure contexts
- **HSID/SSID/SID**: Session identifiers
- **LOGIN_INFO**: Contains login state information
- **VISITOR_INFO1_LIVE**: Visitor tracking cookie
- **PREF**: User preferences
- **YSC**: YouTube session cookie
- **SOCS**: Cookie consent state

### 2. Header Construction

The server constructs HTTP headers from cookies to mimic browser requests:

```python
def setup_from_cookies(self):
    """Setup YTMusic with browser-like headers from cookies"""
    headers = {
        'cookie': self.cookie_string,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'authorization': f'SAPISIDHASH {sapisidhash}',
        'x-youtube-client-name': '67',  # YouTube Music Web
        'x-youtube-client-version': '1.20240101.01.00',
        'origin': 'https://music.youtube.com',
        'referer': 'https://music.youtube.com/'
    }
```

### 3. Session Management

The server maintains separate YTMusic instances for each session:

```python
ytmusic_sessions: Dict[str, YouTubeMusicAPI] = {}

def get_ytmusic(ctx: Context) -> Optional[YouTubeMusicAPI]:
    session_id = id(ctx.session_config)
    if session_id not in ytmusic_sessions:
        # Create new instance with session's cookies
        yt = YouTubeMusicAPI(cookies)
        ytmusic_sessions[session_id] = yt
    return ytmusic_sessions[session_id]
```

## API Integration

### YTMusicAPI Library

The server uses the [ytmusicapi](https://github.com/sigma67/ytmusicapi) library, which:

1. **Reverse-engineers YouTube Music's internal API**: No official API exists
2. **Handles complex request formatting**: YouTube's API uses Protocol Buffers
3. **Manages continuation tokens**: For paginated results
4. **Parses nested response structures**: YouTube returns deeply nested JSON

### Request Flow

1. **Tool Invocation**: LLM calls MCP tool with parameters
2. **Session Retrieval**: Server gets/creates YTMusic instance for session
3. **API Call**: YTMusic library makes authenticated HTTPS request
4. **Response Processing**: Server transforms API response to MCP format
5. **Error Handling**: Graceful degradation with helpful error messages

## Key Implementation Details

### 1. LLM-Driven Playlist Creation

Instead of implementing "smart" features in the MCP server, the design philosophy is:

1. **MCP server provides tools** - Simple, focused functions (search, create playlist, add songs)
2. **LLM does the thinking** - The language model decides what to search for and which songs to add
3. **Natural language stays with the LLM** - The LLM interprets descriptions like "upbeat 90s rock"

This separation of concerns means:
- The MCP server remains simple and maintainable
- The LLM can leverage its full capabilities for music curation
- Users get better results as language models improve

### 2. Error Handling Strategy

The server implements multiple layers of error handling:

```python
def tool_handler():
    # Level 1: Cookie validation
    if not cookies:
        return {"error": "YouTube Music cookies not configured"}
    
    # Level 2: Authentication check
    if not yt.authenticated:
        return {"error": "Authentication required"}
    
    # Level 3: API call error handling
    try:
        result = yt.api_call()
    except Exception as e:
        return {"error": str(e), "message": "Helpful context"}
```

### 3. Data Transformation

YouTube Music returns complex nested structures that need simplification:

```python
# YouTube Music returns:
{
    "contents": {
        "singleColumnBrowseResultsRenderer": {
            "tabs": [{
                "tabRenderer": {
                    "content": {
                        "sectionListRenderer": {
                            "contents": [...]
                        }
                    }
                }
            }]
        }
    }
}

# Server transforms to:
{
    "success": true,
    "playlists": [
        {"id": "...", "title": "...", "song_count": 25}
    ]
}
```

## Security Considerations

### 1. Cookie Security

- **Local Storage Only**: Cookies never leave the user's environment
- **No Transmission**: Server doesn't send cookies to external services
- **Session Isolation**: Each MCP session has isolated authentication
- **No Persistence**: Cookies aren't saved to disk by default

### 2. Authentication Validation

```python
def is_authenticated(self) -> bool:
    """Check if we have valid authentication"""
    if not self.cookie_string:
        return False
    
    # Must have session cookies
    required = ['SAPISID', 'HSID', 'SSID']
    cookies = dict(c.split('=', 1) for c in self.cookie_string.split('; '))
    return all(c in cookies for c in required)
```

### 3. Rate Limiting

YouTube Music has implicit rate limits. The server handles this by:

- Avoiding parallel requests to the same endpoint
- Implementing exponential backoff on errors
- Caching playlist data where appropriate

## Deployment Considerations

### Smithery Deployment

The server is optimized for Smithery deployment:

1. **Per-Session Configuration**: Each user provides their own cookies
2. **Stateless Design**: No shared state between sessions
3. **FastMCP Framework**: Efficient async request handling
4. **Pydantic Validation**: Type-safe configuration

### Environment Variables

```python
class ConfigSchema(BaseModel):
    youtube_music_cookies: str = Field(
        default="",
        description="YouTube Music cookies from browser"
    )
    default_privacy: str = Field(
        default="PRIVATE",
        description="Default playlist privacy"
    )
```

## Limitations and Workarounds

### 1. No Official API

YouTube Music lacks an official API, requiring:
- Reverse-engineering internal endpoints
- Mimicking browser behavior
- Handling undocumented changes

### 2. Cookie Expiration

Cookies expire after ~2 weeks. Mitigation:
- Clear error messages when expired
- Instructions for refreshing cookies
- Graceful degradation for search (works without auth)

### 3. Complex Video IDs

YouTube Music uses different ID formats:
- **videoId**: Standard YouTube video ID
- **setVideoId**: Playlist-specific instance ID
- **browseId**: Navigation/content ID

The server handles ID transformation transparently.

## Testing Strategy

### Unit Testing

```python
def test_cookie_parsing():
    cookies = "SAPISID=xxx; HSID=yyy"
    parsed = parse_cookies(cookies)
    assert parsed['SAPISID'] == 'xxx'

def test_sapisidhash_generation():
    hash = generate_sapisidhash("test_sapisid")
    assert re.match(r'\d+_[a-f0-9]{40}', hash)
```

### Integration Testing

```python
def test_playlist_operations():
    # Create playlist
    playlist = create_playlist("Test Playlist")
    assert playlist['success']
    
    # Add songs
    result = add_songs_to_playlist(playlist['id'], ['videoId'])
    assert result['success']
    
    # Clean up
    delete_playlist(playlist['id'])
```

## Performance Optimization

### 1. Session Caching

YTMusic instances are cached per session to avoid re-authentication:

```python
@lru_cache(maxsize=128)
def get_ytmusic_for_session(session_id: str, cookies: str):
    return YouTubeMusicAPI(cookies)
```

### 2. Lazy Loading

Authentication only happens when needed:

```python
def search_music():
    # Search works without auth for public content
    if not requires_auth:
        return unauthenticated_search()
    
    # Only authenticate for private content
    return authenticated_search()
```

### 3. Response Streaming

Large playlist responses can be streamed:

```python
def get_large_playlist(playlist_id):
    # Initial batch
    playlist = yt.get_playlist(playlist_id, limit=100)
    yield playlist['tracks']
    
    # Continuation
    while playlist.get('continuation'):
        playlist = yt.get_playlist_continuation(playlist['continuation'])
        yield playlist['tracks']
```

## Future Enhancements

### Planned Features

1. **Radio Stations**: Start radio from song/artist
2. **Recommendations**: Get personalized suggestions
3. **Library Management**: Like/unlike songs, manage library
4. **Upload Music**: Upload personal music files
5. **Download Support**: Export playlists to files

### Architecture Improvements

1. **WebSocket Support**: Real-time playback updates
2. **Batch Operations**: Process multiple playlists efficiently
3. **Advanced Caching**: Redis-based result caching
4. **Metrics Collection**: Usage analytics and monitoring

## Debugging

### Enable Debug Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)

# In server code
logger.debug(f"Headers: {headers}")
logger.debug(f"Response: {response.text[:500]}")
```

### Common Issues

1. **401 Unauthorized**: Cookies expired or invalid
2. **403 Forbidden**: SAPISIDHASH generation failed
3. **Empty Results**: Region restrictions or private content
4. **Parsing Errors**: YouTube API structure changed

## References

- [ytmusicapi Documentation](https://ytmusicapi.readthedocs.io/)
- [MCP Specification](https://modelcontextprotocol.io/specification)
- [YouTube Internal API Research](https://github.com/sigma67/ytmusicapi/wiki)
- [Smithery MCP Deployment](https://docs.smithery.ai/deployment)

## Contact

For technical questions or contributions:
- GitHub Issues: [youtube-music-mcp-server/issues](https://github.com/CaullenOmdahl/youtube-music-mcp-server/issues)
- Pull Requests welcome for bug fixes and features