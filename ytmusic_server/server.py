"""
Main MCP server implementation for YouTube Music integration.
"""

import asyncio
import os
from typing import Any, Dict, List, Optional, Sequence
import structlog
from mcp.server.fastmcp import FastMCP
from mcp import types

from .models.config import ServerConfig, OAuthConfig, SecurityConfig, APIConfig
from .models.auth import UserSession, OAuthToken, AuthState
from .auth.oauth_manager import OAuthManager
from .auth.session_manager import SessionManager
from .auth.token_storage import MemoryTokenStorage, RedisTokenStorage
from .security.encryption import EncryptionManager
from .security.validators import SecurityValidator
from .security.middleware import SecurityMiddleware
from .ytmusic.client import YTMusicClient
from .ytmusic.rate_limiter import RateLimiter
from .monitoring.metrics import MetricsCollector
from .monitoring.health_check import HealthChecker

logger = structlog.get_logger(__name__)


class YouTubeMusicMCPServer:
    """
    Enterprise-grade YouTube Music MCP Server with OAuth 2.1 authentication.

    Features:
    - OAuth 2.1 with PKCE authentication flow
    - Comprehensive security and rate limiting
    - Session management and token storage
    - YouTube Music API integration
    - Health monitoring and metrics collection
    - Production-ready error handling
    """

    def __init__(self, config: ServerConfig):
        self.config = config
        self.logger = logger.bind(component="ytmusic_mcp_server")

        # Initialize core components
        self.encryption_manager = EncryptionManager(config.encryption_key)

        # Initialize token storage
        if config.redis_url:
            self.token_storage = RedisTokenStorage(self.encryption_manager, config.redis_url)
        else:
            self.token_storage = MemoryTokenStorage(self.encryption_manager)

        # Initialize managers
        self.session_manager = SessionManager(self.token_storage, config.security_config)
        self.oauth_manager = OAuthManager(config.oauth_config, self.token_storage)

        # Initialize security components
        self.security_validator = SecurityValidator()
        self.security_middleware = SecurityMiddleware(
            self.security_validator,
            rate_limit_requests=config.rate_limit_per_minute,
        )

        # Initialize YouTube Music components
        self.rate_limiter = RateLimiter(
            requests_per_minute=config.api_config.rate_limit_per_minute,
            requests_per_hour=config.api_config.rate_limit_per_hour,
        )
        self.ytmusic_client = YTMusicClient(config.api_config, self.rate_limiter)

        # Initialize monitoring
        self.metrics_collector = MetricsCollector()
        self.health_checker = HealthChecker()

        # Register health checks
        self._register_health_checks()

        # MCP server with HTTP configuration
        port = int(os.getenv("PORT", "8081"))
        self.mcp = FastMCP(
            name="YouTube Music MCP Server",
            host="0.0.0.0",
            port=port,
            streamable_http_path="/mcp"
        )
        self._register_tools()
        self._register_health_endpoints()

        self.logger.info("YouTube Music MCP Server initialized")

    def _register_health_checks(self) -> None:
        """Register health check functions."""
        self.health_checker.register_check("ytmusic_api", self.health_checker.check_ytmusic_api)
        self.health_checker.register_check("memory", self.health_checker.check_memory_usage)

    def _register_health_endpoints(self) -> None:
        """Register HTTP health check endpoints."""
        from starlette.requests import Request
        from starlette.responses import JSONResponse

        @self.mcp.custom_route("/health", methods=["GET"])
        async def health_endpoint(request: Request) -> JSONResponse:
            """Health check endpoint for Docker and load balancers."""
            try:
                health_status = await self.health_checker.get_health_status()
                return JSONResponse({
                    "status": "healthy",
                    "service": "YouTube Music MCP Server",
                    "version": "2.0.0",
                    "health": health_status,
                    "timestamp": asyncio.get_event_loop().time(),
                })
            except Exception as e:
                self.logger.error("Health endpoint error", error=str(e))
                return JSONResponse(
                    {"status": "unhealthy", "error": str(e)},
                    status_code=503
                )

    def _register_tools(self) -> None:
        """Register MCP tools."""

        # Authentication tools
        @self.mcp.tool()
        async def get_auth_status(session_id: Optional[str] = None) -> Dict[str, Any]:
            """
            Check authentication status for a session.

            Args:
                session_id: Optional session ID to check

            Returns:
                Authentication status information
            """
            try:
                if not session_id:
                    # Create new session
                    session = await self.session_manager.create_session()
                    auth_url = await self.oauth_manager.get_authorization_url(session)

                    return {
                        "authenticated": False,
                        "session_id": session.session_id,
                        "auth_url": auth_url,
                        "state": session.state.value,
                        "expires_at": session.expires_at.isoformat(),
                    }

                # Check existing session
                session = await self.session_manager.get_session(session_id)
                if not session:
                    return {"error": "Session not found", "authenticated": False}

                is_authenticated = session.is_authenticated
                response = {
                    "authenticated": is_authenticated,
                    "session_id": session.session_id,
                    "state": session.state.value,
                    "expires_at": session.expires_at.isoformat(),
                }

                if not is_authenticated and session.state == AuthState.PENDING:
                    auth_url = await self.oauth_manager.get_authorization_url(session)
                    response["auth_url"] = auth_url

                return response

            except Exception as e:
                self.logger.error("Error checking auth status", error=str(e))
                return {"error": str(e), "authenticated": False}

        # YouTube Music search
        @self.mcp.tool()
        async def search_music(
            query: str,
            session_id: Optional[str] = None,
            filter_type: Optional[str] = None,
            limit: int = 20
        ) -> Dict[str, Any]:
            """
            Search for music on YouTube Music.

            Args:
                query: Search query string
                session_id: Session ID for authentication
                filter_type: Optional filter (songs, videos, albums, artists, playlists)
                limit: Maximum results to return (default: 20)

            Returns:
                Search results from YouTube Music
            """
            start_time = asyncio.get_event_loop().time()

            try:
                # Validate session and get OAuth token
                session, oauth_token = await self._validate_session_and_token(session_id)

                # Perform search
                results = await self.ytmusic_client.search_music(
                    session, oauth_token, query, filter_type, limit
                )

                # Record metrics
                duration = asyncio.get_event_loop().time() - start_time
                self.metrics_collector.record_request(
                    session.session_id, "search_music", duration, True
                )

                return {
                    "success": True,
                    "results": results,
                    "query": query,
                    "count": len(results),
                }

            except Exception as e:
                duration = asyncio.get_event_loop().time() - start_time
                if session_id:
                    self.metrics_collector.record_request(
                        session_id, "search_music", duration, False, str(type(e).__name__)
                    )

                self.logger.error("Music search failed", query=query, error=str(e))
                return {"success": False, "error": str(e)}

        # Playlist management
        @self.mcp.tool()
        async def create_playlist(
            name: str,
            session_id: Optional[str] = None,
            description: Optional[str] = None,
            privacy_status: str = "PRIVATE"
        ) -> Dict[str, Any]:
            """
            Create a new playlist on YouTube Music.

            Args:
                name: Playlist name
                session_id: Session ID for authentication
                description: Optional playlist description
                privacy_status: Playlist privacy (PRIVATE, PUBLIC, UNLISTED)

            Returns:
                Created playlist information
            """
            start_time = asyncio.get_event_loop().time()

            try:
                # Validate session and get OAuth token
                session, oauth_token = await self._validate_session_and_token(session_id)

                # Create playlist
                playlist_id = await self.ytmusic_client.create_playlist(
                    session, oauth_token, name, description, privacy_status
                )

                # Record metrics
                duration = asyncio.get_event_loop().time() - start_time
                self.metrics_collector.record_request(
                    session.session_id, "create_playlist", duration, True
                )

                return {
                    "success": True,
                    "playlist_id": playlist_id,
                    "name": name,
                    "privacy_status": privacy_status,
                }

            except Exception as e:
                duration = asyncio.get_event_loop().time() - start_time
                if session_id:
                    self.metrics_collector.record_request(
                        session_id, "create_playlist", duration, False, str(type(e).__name__)
                    )

                self.logger.error("Playlist creation failed", name=name, error=str(e))
                return {"success": False, "error": str(e)}

        @self.mcp.tool()
        async def get_playlists(session_id: Optional[str] = None, limit: int = 25) -> Dict[str, Any]:
            """
            Get user's playlists from YouTube Music.

            Args:
                session_id: Session ID for authentication
                limit: Maximum playlists to return (default: 25)

            Returns:
                User's playlists
            """
            start_time = asyncio.get_event_loop().time()

            try:
                # Validate session and get OAuth token
                session, oauth_token = await self._validate_session_and_token(session_id)

                # Get playlists
                playlists = await self.ytmusic_client.get_user_playlists(
                    session, oauth_token, limit
                )

                # Record metrics
                duration = asyncio.get_event_loop().time() - start_time
                self.metrics_collector.record_request(
                    session.session_id, "get_playlists", duration, True
                )

                return {
                    "success": True,
                    "playlists": playlists,
                    "count": len(playlists),
                }

            except Exception as e:
                duration = asyncio.get_event_loop().time() - start_time
                if session_id:
                    self.metrics_collector.record_request(
                        session_id, "get_playlists", duration, False, str(type(e).__name__)
                    )

                self.logger.error("Get playlists failed", error=str(e))
                return {"success": False, "error": str(e)}

        @self.mcp.tool()
        async def add_songs_to_playlist(
            playlist_id: str,
            video_ids: List[str],
            session_id: Optional[str] = None
        ) -> Dict[str, Any]:
            """
            Add songs to an existing playlist.

            Args:
                playlist_id: Target playlist ID
                video_ids: List of video IDs to add
                session_id: Session ID for authentication

            Returns:
                Operation result
            """
            start_time = asyncio.get_event_loop().time()

            try:
                # Validate session and get OAuth token
                session, oauth_token = await self._validate_session_and_token(session_id)

                # Add songs to playlist
                success = await self.ytmusic_client.add_songs_to_playlist(
                    session, oauth_token, playlist_id, video_ids
                )

                # Record metrics
                duration = asyncio.get_event_loop().time() - start_time
                self.metrics_collector.record_request(
                    session.session_id, "add_songs_to_playlist", duration, True
                )

                return {
                    "success": success,
                    "playlist_id": playlist_id,
                    "added_count": len(video_ids),
                }

            except Exception as e:
                duration = asyncio.get_event_loop().time() - start_time
                if session_id:
                    self.metrics_collector.record_request(
                        session_id, "add_songs_to_playlist", duration, False, str(type(e).__name__)
                    )

                self.logger.error("Add songs to playlist failed", playlist_id=playlist_id, error=str(e))
                return {"success": False, "error": str(e)}

        @self.mcp.tool()
        async def get_playlist_details(
            playlist_id: str,
            session_id: Optional[str] = None,
            limit: Optional[int] = None
        ) -> Dict[str, Any]:
            """
            Get detailed information about a playlist.

            Args:
                playlist_id: Playlist ID
                session_id: Session ID for authentication
                limit: Optional limit for tracks

            Returns:
                Playlist details including tracks
            """
            start_time = asyncio.get_event_loop().time()

            try:
                # Validate session and get OAuth token
                session, oauth_token = await self._validate_session_and_token(session_id)

                # Get playlist details
                playlist = await self.ytmusic_client.get_playlist_details(
                    session, oauth_token, playlist_id, limit
                )

                # Record metrics
                duration = asyncio.get_event_loop().time() - start_time
                self.metrics_collector.record_request(
                    session.session_id, "get_playlist_details", duration, True
                )

                return {
                    "success": True,
                    "playlist": playlist,
                }

            except Exception as e:
                duration = asyncio.get_event_loop().time() - start_time
                if session_id:
                    self.metrics_collector.record_request(
                        session_id, "get_playlist_details", duration, False, str(type(e).__name__)
                    )

                self.logger.error("Get playlist details failed", playlist_id=playlist_id, error=str(e))
                return {"success": False, "error": str(e)}

        # Health check endpoint (for Docker/Smithery)
        @self.mcp.tool()
        async def health_check() -> Dict[str, Any]:
            """
            Health check endpoint for monitoring and load balancers.

            Returns:
                Server health status
            """
            try:
                health_status = await self.health_checker.get_health_status()
                return {
                    "status": "healthy",
                    "service": "YouTube Music MCP Server",
                    "version": "2.0.0",
                    "health": health_status,
                    "timestamp": asyncio.get_event_loop().time(),
                }
            except Exception as e:
                self.logger.error("Health check failed", error=str(e))
                return {
                    "status": "unhealthy",
                    "error": str(e),
                    "timestamp": asyncio.get_event_loop().time(),
                }

        # System tools
        @self.mcp.tool()
        async def get_server_status() -> Dict[str, Any]:
            """
            Get server health and status information.

            Returns:
                Server status and metrics
            """
            try:
                health_status = await self.health_checker.get_health_status()
                metrics = self.metrics_collector.get_summary_metrics()

                return {
                    "server": "YouTube Music MCP Server",
                    "version": "2.0.0",
                    "health": health_status,
                    "metrics": metrics,
                    "timestamp": asyncio.get_event_loop().time(),
                }

            except Exception as e:
                self.logger.error("Get server status failed", error=str(e))
                return {"error": str(e)}

    async def _validate_session_and_token(self, session_id: Optional[str]) -> tuple[UserSession, OAuthToken]:
        """
        Validate session and get OAuth token.

        Args:
            session_id: Session identifier

        Returns:
            Tuple of (session, oauth_token)

        Raises:
            Exception: If session is invalid or not authenticated
        """
        if not session_id:
            raise Exception("Session ID is required")

        session = await self.session_manager.get_session(session_id)
        if not session:
            raise Exception("Session not found")

        if not session.is_authenticated:
            raise Exception("Session is not authenticated")

        if not session.oauth_token:
            raise Exception("No OAuth token available")

        # Check if token needs refresh
        if session.oauth_token.is_expired:
            if session.oauth_token.refresh_token:
                try:
                    new_token = await self.oauth_manager.refresh_token(session.oauth_token)
                    session.oauth_token = new_token
                    await self.session_manager.update_session(session)
                except Exception as e:
                    self.logger.error("Token refresh failed", session_id=session_id[:8] + "...", error=str(e))
                    raise Exception("Token refresh failed, re-authentication required")
            else:
                raise Exception("Token expired and no refresh token available")

        return session, session.oauth_token

    async def start(self) -> None:
        """Start the server and all background services."""
        try:
            # Start session manager
            await self.session_manager.start()

            # Start health checker
            await self.health_checker.start()

            self.logger.info("YouTube Music MCP Server started successfully")

        except Exception as e:
            self.logger.error("Failed to start server", error=str(e))
            raise

    async def stop(self) -> None:
        """Stop the server and cleanup resources."""
        try:
            # Stop background services
            await self.session_manager.stop()
            await self.health_checker.stop()

            # Close token storage if needed
            if hasattr(self.token_storage, 'close'):
                await self.token_storage.close()

            self.logger.info("YouTube Music MCP Server stopped")

        except Exception as e:
            self.logger.error("Error stopping server", error=str(e))


def create_server() -> YouTubeMusicMCPServer:
    """
    Create and configure the YouTube Music MCP server.

    Returns:
        Configured server instance
    """
    # Load and validate encryption key
    encryption_key = os.getenv("ENCRYPTION_KEY")
    if encryption_key:
        try:
            # Test if the provided key is valid
            import base64
            key_bytes = base64.b64decode(encryption_key)
            if len(key_bytes) != 32:
                logger.warning("Invalid encryption key provided, generating new one")
                encryption_key = EncryptionManager.generate_key()
        except Exception:
            logger.warning("Failed to decode encryption key, generating new one")
            encryption_key = EncryptionManager.generate_key()
    else:
        encryption_key = EncryptionManager.generate_key()

    # Load configuration from environment
    server_config = ServerConfig(
        oauth_client_id=os.getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
        oauth_client_secret=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
        encryption_key=encryption_key,
        redis_url=os.getenv("REDIS_URL"),
        rate_limit_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "60")),
    )

    return YouTubeMusicMCPServer(server_config)


# For direct usage
if __name__ == "__main__":
    import uvicorn

    # Configure structured logging
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    def main():
        import uvicorn
        from starlette.middleware.cors import CORSMiddleware
        from starlette.applications import Starlette
        from starlette.routing import Mount
        from ytmusic_server.middleware.oauth_middleware import OAuthMiddleware
        from ytmusic_server.auth.oauth_endpoints import OAuthEndpoints

        # Create server instance
        server = create_server()

        # Start server components
        asyncio.run(server.start())

        # Get the Starlette app from FastMCP
        mcp_app = server.mcp.streamable_http_app()

        # Get port and server URL
        port = int(os.getenv("PORT", "8081"))
        server_url = os.getenv("SERVER_URL", f"http://localhost:{port}")

        # Create OAuth endpoints
        youtube_oauth_config = {
            "client_id": os.getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
            "client_secret": os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
        }
        oauth_endpoints = OAuthEndpoints(server_url, youtube_oauth_config)

        # Create main application with OAuth routes
        app = Starlette(routes=oauth_endpoints.get_routes() + [
            Mount("/mcp", mcp_app),
        ])

        # Add OAuth middleware (only for /mcp routes)
        app.add_middleware(
            OAuthMiddleware,
            server_url=server_url
        )

        # Add CORS middleware for browser based clients
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
            allow_headers=["*"],
            expose_headers=["mcp-session-id", "mcp-protocol-version", "authorization"],
            max_age=86400,
        )

        logger = structlog.get_logger()
        logger.info(f"Starting YouTube Music MCP Server with OAuth on port {port}")

        # Run with uvicorn
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

    main()