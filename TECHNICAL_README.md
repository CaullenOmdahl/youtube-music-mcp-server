# YouTube Music MCP Server - Technical Documentation

## Overview

The YouTube Music MCP Server is an enterprise-grade Model Context Protocol (MCP) server that provides secure, OAuth 2.1-authenticated access to YouTube Music functionality. It implements modern OAuth transport-level authentication with PKCE (Proof Key for Code Exchange) for enhanced security, and includes comprehensive platform awareness for deployment on services like Smithery.

## Architecture

### Core Components

#### 1. FastMCP Framework Integration
- **Framework**: Built on `mcp.server.fastmcp.FastMCP` for MCP protocol compliance
- **Transport**: HTTP/HTTPS with Starlette ASGI application
- **Protocol**: Implements MCP specification with OAuth 2.1 transport authentication

#### 2. OAuth 2.1 Authentication System
- **Standard**: RFC 6749 (OAuth 2.0) + RFC 7636 (PKCE) + OAuth 2.1 security features
- **Transport-Level**: OAuth implemented at transport layer, not as tools
- **RFC 9728**: Protected Resource Metadata for OAuth discovery
- **Flow**: Authorization Code flow with PKCE for enhanced security

#### 3. Platform-Aware URL Detection
- **Smithery Integration**: Automatic detection of Smithery.ai deployment environment
- **Request Context**: Dynamic URL detection from HTTP headers for proxy/reverse proxy setups
- **Environment Variables**: Support for explicit URL configuration via `PUBLIC_URL`
- **Fallback**: Local development support with localhost URLs

#### 4. Security Architecture
- **Token Management**: Secure token storage with encryption support
- **Session Management**: Comprehensive session lifecycle with expiration handling
- **Rate Limiting**: Per-session and global rate limiting
- **Encryption**: Symmetric encryption for sensitive data storage
- **Validation**: Request validation and security middleware

#### 5. YouTube Music Integration
- **API**: YouTube Data API v3 integration via `ytmusicapi`
- **Rate Limiting**: Intelligent rate limiting for API calls
- **Error Handling**: Comprehensive error handling and retry logic
- **Monitoring**: Request tracking and performance metrics

## File Structure

```
ytmusic_server/
├── __init__.py                    # Package initialization
├── server.py                      # Main server implementation and FastMCP setup
├── config.py                      # Platform-aware configuration management
│
├── auth/                          # Authentication system
│   ├── __init__.py
│   ├── oauth_endpoints.py         # OAuth 2.1 endpoints (RFC 6749 + RFC 9728)
│   ├── oauth_manager.py           # OAuth flow management
│   ├── resource_metadata.py       # RFC 9728 Protected Resource Metadata
│   ├── session_manager.py         # Session lifecycle management
│   └── token_storage.py           # Secure token storage (Memory/Redis)
│
├── middleware/                    # HTTP middleware
│   ├── __init__.py
│   └── oauth_middleware.py        # Transport-level OAuth authentication
│
├── models/                        # Data models
│   ├── __init__.py
│   ├── auth.py                    # Authentication models (UserSession, OAuthToken, PKCE)
│   ├── config.py                  # Configuration models (ServerConfig, OAuthConfig)
│   └── youtube.py                 # YouTube Music data models
│
├── security/                      # Security components
│   ├── __init__.py
│   ├── encryption.py              # Data encryption utilities
│   ├── middleware.py              # Security middleware
│   └── validators.py              # Input validation and security checks
│
├── ytmusic/                       # YouTube Music integration
│   ├── __init__.py
│   ├── client.py                  # YouTube Music API client
│   └── rate_limiter.py            # API rate limiting
│
└── monitoring/                    # Health and monitoring
    ├── __init__.py
    ├── health_check.py            # Health check endpoints
    └── metrics.py                 # Performance metrics collection
```

## OAuth 2.1 Implementation

### Transport-Level Authentication

The server implements OAuth 2.1 at the transport level, meaning:
- OAuth tokens are required for ALL MCP requests (except public endpoints)
- No OAuth-specific tools - authentication is handled by middleware
- WWW-Authenticate headers provide OAuth metadata URLs for client discovery

### Key Features

1. **PKCE Security** (`ytmusic_server/models/auth.py:22-41`)
   - SHA256-based code challenges
   - Cryptographically secure code verifiers
   - Protection against authorization code interception

2. **Platform-Aware URL Detection** (`ytmusic_server/config.py:27-64`)
   ```python
   @property
   def base_url(self) -> str:
       # 1. Explicit override (PUBLIC_URL)
       # 2. Request context detection
       # 3. Smithery platform detection
       # 4. Generic proxy detection
       # 5. Local development fallback
   ```

3. **RFC 9728 Compliance** (`ytmusic_server/auth/oauth_endpoints.py:43-47`)
   - Protected Resource Metadata endpoint
   - OAuth discovery for MCP clients
   - Proper authorization server metadata

### OAuth Endpoints

| Endpoint | Purpose | RFC |
|----------|---------|-----|
| `/.well-known/oauth-protected-resource` | Protected Resource Metadata | RFC 9728 |
| `/.well-known/oauth-authorization-server` | Authorization Server Metadata | RFC 8414 |
| `/.well-known/jwks.json` | JSON Web Key Set | RFC 7517 |
| `/oauth/authorize` | Authorization endpoint | RFC 6749 |
| `/oauth/token` | Token endpoint | RFC 6749 |
| `/oauth/register` | Dynamic client registration | RFC 7591 |

## MCP Tools Available

The server provides the following MCP tools for YouTube Music interaction:

### Authentication Tools

#### `get_auth_status`
- **Purpose**: Check authentication status and initiate OAuth flow
- **Parameters**: `session_id` (optional)
- **Returns**: Authentication status, authorization URL if needed
- **Implementation**: `ytmusic_server/server.py:125-171`

### YouTube Music Tools

#### `search_music`
- **Purpose**: Search for music on YouTube Music
- **Parameters**:
  - `query` (string): Search query
  - `session_id` (string): Authentication session
  - `filter_type` (optional): Filter by songs, videos, albums, artists, playlists
  - `limit` (int): Maximum results (default: 20)
- **Implementation**: `ytmusic_server/server.py:174-225`

#### `create_playlist`
- **Purpose**: Create a new playlist
- **Parameters**:
  - `name` (string): Playlist name
  - `session_id` (string): Authentication session
  - `description` (optional): Playlist description
  - `privacy_status` (string): PRIVATE, PUBLIC, or UNLISTED
- **Implementation**: `ytmusic_server/server.py:228-279`

#### `get_playlists`
- **Purpose**: Get user's playlists
- **Parameters**:
  - `session_id` (string): Authentication session
  - `limit` (int): Maximum playlists to return (default: 25)
- **Implementation**: `ytmusic_server/server.py:281-324`

#### `add_songs_to_playlist`
- **Purpose**: Add songs to an existing playlist
- **Parameters**:
  - `playlist_id` (string): Target playlist ID
  - `video_ids` (list): List of video IDs to add
  - `session_id` (string): Authentication session
- **Implementation**: `ytmusic_server/server.py:326-374`

#### `get_playlist_details`
- **Purpose**: Get detailed playlist information including tracks
- **Parameters**:
  - `playlist_id` (string): Playlist ID
  - `session_id` (string): Authentication session
  - `limit` (optional): Limit for tracks
- **Implementation**: `ytmusic_server/server.py:376-423`

### System Tools

#### `health_check`
- **Purpose**: Server health monitoring
- **Returns**: Health status and system information
- **Implementation**: `ytmusic_server/server.py:426-449`

#### `get_server_status`
- **Purpose**: Comprehensive server status and metrics
- **Returns**: Health status, performance metrics, server information
- **Implementation**: `ytmusic_server/server.py:452-474`

## Development Setup

### Prerequisites

- Python 3.11 or higher
- Google OAuth 2.1 credentials with YouTube Data API access
- Optional: Redis for production token storage

### Local Development

1. **Clone and Install**:
   ```bash
   git clone <repository>
   cd YTMusicPlugin
   pip install -e .
   ```

2. **Environment Configuration**:
   ```bash
   export GOOGLE_OAUTH_CLIENT_ID="your-client-id"
   export GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
   export BYPASS_AUTH_FOR_TESTING="true"  # For local testing only
   export PORT="8081"
   ```

3. **Run Server**:
   ```bash
   python -m ytmusic_server.server
   ```

4. **Testing with Authentication Bypass**:
   - Set `BYPASS_AUTH_FOR_TESTING=true` for local development
   - Server will accept requests from localhost without OAuth tokens
   - Mock token information is provided to tools

### Configuration Options

#### Environment Variables

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID | - | Yes |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret | - | Yes |
| `PUBLIC_URL` | Override base URL detection | Auto-detected | No |
| `PORT` | Server port | 8081 | No |
| `REDIS_URL` | Redis for token storage | None (uses memory) | No |
| `ENCRYPTION_KEY` | Base64 32-byte key | Auto-generated | No |
| `RATE_LIMIT_PER_MINUTE` | Global rate limit | 60 | No |
| `BYPASS_AUTH_FOR_TESTING` | Disable OAuth for local testing | false | No |
| `LOG_LEVEL` | Logging level | INFO | No |

#### Smithery Deployment Variables

| Variable | Purpose | Auto-Detected |
|----------|---------|---------------|
| `SMITHERY_PUBLIC_URL` | Explicit Smithery URL | No |
| `SMITHERY_USERNAME` | Smithery username | Yes |
| `SMITHERY_SERVER_NAME` | Server name | Yes |
| `HTTP_X_FORWARDED_HOST` | Forwarded host header | Yes |
| `HTTP_X_FORWARDED_PROTO` | Protocol header | Yes |

## Deployment

### Docker Deployment

1. **Build Image**:
   ```bash
   docker build -t youtube-music-mcp .
   ```

2. **Run Container**:
   ```bash
   docker run -d \
     -p 8081:8081 \
     -e GOOGLE_OAUTH_CLIENT_ID="your-client-id" \
     -e GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret" \
     -e PUBLIC_URL="https://your-domain.com" \
     youtube-music-mcp
   ```

### Smithery Deployment

The server includes comprehensive Smithery platform detection:

1. **Platform Detection** (`ytmusic_server/config.py:65-91`):
   - Automatic detection of Smithery environment
   - URL construction from Smithery metadata
   - Header-based URL detection for proxy setups

2. **OAuth URL Awareness**:
   - Detects Smithery URLs from request headers
   - Ensures OAuth metadata returns correct Smithery URLs
   - Supports proxy/reverse proxy configurations

3. **Health Checks**:
   - `/health` endpoint for container health checks
   - Docker HEALTHCHECK configuration
   - Kubernetes readiness/liveness probe support

### Production Considerations

#### Security

1. **Token Storage**:
   - Use Redis for production token storage
   - Enable encryption with secure key management
   - Regular token cleanup and rotation

2. **OAuth Security**:
   - Use HTTPS in production
   - Secure redirect URI configuration
   - Rate limiting and DDoS protection

3. **Monitoring**:
   - Enable metrics collection
   - Configure structured logging
   - Set up health check monitoring

#### Scaling

1. **Horizontal Scaling**:
   - Stateless design supports multiple instances
   - Redis for shared session storage
   - Load balancer configuration

2. **Performance**:
   - Connection pooling for YouTube API
   - Caching strategies for frequent requests
   - Async/await throughout for high concurrency

## Troubleshooting

### Common Issues

1. **OAuth Discovery Failures**:
   - Ensure `PUBLIC_URL` is correctly set for production
   - Check platform detection logs in server output
   - Verify OAuth endpoints are accessible

2. **Authentication Errors**:
   - Validate Google OAuth credentials
   - Check redirect URI configuration
   - Verify YouTube Data API is enabled

3. **Platform URL Issues**:
   - Check request headers for proxy configuration
   - Ensure Smithery environment variables are set
   - Review platform detection logs

### Debug Information

Enable debug logging to troubleshoot issues:

```bash
export LOG_LEVEL="DEBUG"
python -m ytmusic_server.server
```

Debug logs include:
- Platform detection results
- OAuth flow details
- Request/response information
- Token validation status

### Health Check Endpoints

- **HTTP**: `GET /health` - Basic health status
- **MCP Tool**: `health_check` - Detailed health information
- **MCP Tool**: `get_server_status` - Comprehensive system status

## Advanced Features

### Request Context URL Detection

The server implements sophisticated URL detection (`ytmusic_server/config.py:92-141`):

```python
def _detect_from_request_context(self) -> str:
    """Detect URL from current request context (headers)."""
    # Check forwarded headers from proxy/reverse proxy
    # Determine protocol (https for non-localhost)
    # Handle path prefixes
    # Special Smithery detection
    # Return appropriate URL
```

### OAuth Middleware Integration

Transport-level authentication (`ytmusic_server/middleware/oauth_middleware.py:50-93`):

```python
async def dispatch(self, request: Request, call_next):
    # Set request context for URL detection
    config.set_request_context(request)

    # Skip public endpoints
    # Handle authentication bypass for testing
    # Extract and validate bearer tokens
    # Add token info to request state
    # Return proper WWW-Authenticate headers for 401s
```

### Session Management

Comprehensive session lifecycle (`ytmusic_server/models/auth.py:88-158`):

- Session creation and validation
- Token refresh handling
- Rate limiting per session
- Automatic cleanup of expired sessions
- PKCE challenge management

## Contributing

### Development Guidelines

1. **Code Style**:
   - Follow PEP 8 formatting
   - Use type hints throughout
   - Comprehensive docstrings for all public methods

2. **Security**:
   - Never log sensitive tokens or credentials
   - Use secure random generation for secrets
   - Validate all inputs

3. **Testing**:
   - Use `BYPASS_AUTH_FOR_TESTING=true` for development
   - Write unit tests for new functionality
   - Integration tests for OAuth flows

4. **Documentation**:
   - Update this README for architectural changes
   - Document new MCP tools
   - Include configuration changes

### Architecture Decisions

1. **OAuth 2.1 Transport-Level**: Chosen for security and MCP compliance
2. **Platform-Aware URLs**: Enables seamless deployment across environments
3. **FastMCP Framework**: Provides robust MCP protocol implementation
4. **Pydantic Models**: Ensures type safety and data validation
5. **Structured Logging**: Enables comprehensive debugging and monitoring

This architecture provides a production-ready, secure, and scalable YouTube Music MCP server suitable for enterprise deployment.