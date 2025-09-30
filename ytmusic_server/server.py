"""
Main MCP server implementation for YouTube Music integration.
"""

import asyncio
import os
from typing import Any, Dict, List, Optional, Sequence
import structlog
from mcp.server.fastmcp import FastMCP
from mcp import types

from .models.config import ServerConfig
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

        # Initialize YouTube Music components with direct OAuth credentials
        try:
            self.rate_limiter = RateLimiter(
                requests_per_minute=config.api_config.rate_limit_per_minute,
                requests_per_hour=config.api_config.rate_limit_per_hour,
            )
            self.ytmusic_client = YTMusicClient(config, self.rate_limiter)
            self.logger.info("YouTube Music client initialized successfully")
        except Exception as e:
            self.logger.error("Failed to initialize YouTube Music client", error=str(e))
            # Continue initialization even if YTMusic client fails
            # This allows the server to start and provide helpful error messages
            self.rate_limiter = None
            self.ytmusic_client = None

        # Initialize monitoring
        self.metrics_collector = MetricsCollector()
        self.health_checker = HealthChecker()

        # Register health checks
        self._register_health_checks()

        # MCP server with HTTP configuration
        port = int(os.getenv("PORT", "8081"))
        self.mcp = FastMCP(
            name="YouTube Music MCP Server",
        )
        self._register_tools()
        self._register_health_endpoints()

        self.logger.info("YouTube Music MCP Server initialized")

    def _register_health_checks(self) -> None:
        """Register health check functions."""
        self.health_checker.register_check(
            "ytmusic_api", self.health_checker.check_ytmusic_api
        )
        self.health_checker.register_check(
            "memory", self.health_checker.check_memory_usage
        )

    def _register_health_endpoints(self) -> None:
        """Register HTTP health check endpoints."""
        from starlette.requests import Request
        from starlette.responses import JSONResponse

        @self.mcp.custom_route("/health", methods=["GET"])
        async def health_endpoint(request: Request) -> JSONResponse:
            """Health check endpoint for Docker and load balancers."""
            try:
                health_status = await self.health_checker.get_health_status()
                return JSONResponse(
                    {
                        "status": "healthy",
                        "service": "YouTube Music MCP Server",
                        "version": "2.0.0",
                        "health": health_status,
                        "timestamp": asyncio.get_event_loop().time(),
                    }
                )
            except Exception as e:
                self.logger.error("Health endpoint error", error=str(e))
                return JSONResponse(
                    {"status": "unhealthy", "error": str(e)}, status_code=503
                )

    def _register_tools(self) -> None:
        """Register MCP tools."""

        # YouTube Music search
        @self.mcp.tool()
        async def search_music(
            query: str,
            filter_type: Optional[str] = None,
            limit: int = 20,
        ) -> Dict[str, Any]:
            """
            Search for music on YouTube Music.

            Args:
                query: Search query string
                filter_type: Optional filter (songs, videos, albums, artists, playlists)
                limit: Maximum results to return (default: 20)

            Returns:
                Search results from YouTube Music
            """
            # Check if client is available
            if self.ytmusic_client is None:
                return {
                    "success": False,
                    "error": "YouTube Music client not initialized. Please check your OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) in Smithery settings.",
                }

            try:
                # Perform search using direct authentication
                results = await self.ytmusic_client.search_music(
                    query, filter_type, limit
                )

                return {
                    "success": True,
                    "results": results,
                    "query": query,
                    "count": len(results),
                }

            except Exception as e:
                self.logger.error("Music search failed", query=query, error=str(e))
                return {"success": False, "error": str(e)}

        # Playlist management
        @self.mcp.tool()
        async def create_playlist(
            name: str,
            description: Optional[str] = None,
            privacy_status: str = "PRIVATE",
        ) -> Dict[str, Any]:
            """
            Create a new playlist on YouTube Music.

            Args:
                name: Playlist name
                description: Optional playlist description
                privacy_status: Playlist privacy (PRIVATE, PUBLIC, UNLISTED)

            Returns:
                Created playlist information
            """
            # Check if client is available
            if self.ytmusic_client is None:
                return {
                    "success": False,
                    "error": "YouTube Music client not initialized. Please check your OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) in Smithery settings.",
                }

            try:
                # Create playlist using direct authentication
                result = await self.ytmusic_client.create_playlist(
                    name, description or "", privacy_status
                )

                return {
                    "success": True,
                    **result,
                }

            except Exception as e:
                self.logger.error("Playlist creation failed", name=name, error=str(e))
                return {"success": False, "error": str(e)}

        @self.mcp.tool()
        async def get_playlists(limit: int = 25) -> Dict[str, Any]:
            """
            Get user's playlists from YouTube Music.

            Args:
                limit: Maximum playlists to return (default: 25)

            Returns:
                User's playlists
            """
            # Check if client is available
            if self.ytmusic_client is None:
                return {
                    "success": False,
                    "error": "YouTube Music client not initialized. Please check your OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) in Smithery settings.",
                }

            try:
                # Get playlists using direct authentication
                playlists = await self.ytmusic_client.get_user_playlists(limit)

                return {
                    "success": True,
                    "playlists": playlists,
                    "count": len(playlists),
                }

            except Exception as e:
                self.logger.error("Get playlists failed", error=str(e))
                return {"success": False, "error": str(e)}

        @self.mcp.tool()
        async def add_songs_to_playlist(
            playlist_id: str, video_ids: List[str]
        ) -> Dict[str, Any]:
            """
            Add songs to an existing playlist.

            Args:
                playlist_id: Target playlist ID
                video_ids: List of video IDs to add

            Returns:
                Operation result
            """
            # Check if client is available
            if self.ytmusic_client is None:
                return {
                    "success": False,
                    "error": "YouTube Music client not initialized. Please check your OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) in Smithery settings.",
                }

            try:
                # Add songs to playlist using direct authentication
                result = await self.ytmusic_client.add_songs_to_playlist(
                    playlist_id, video_ids
                )

                return {
                    "success": True,
                    **result,
                }

            except Exception as e:
                self.logger.error(
                    "Add songs to playlist failed",
                    playlist_id=playlist_id,
                    error=str(e),
                )
                return {"success": False, "error": str(e)}

        @self.mcp.tool()
        async def get_playlist_details(
            playlist_id: str,
            limit: Optional[int] = None,
        ) -> Dict[str, Any]:
            """
            Get detailed information about a playlist.

            Args:
                playlist_id: Playlist ID
                limit: Optional limit for tracks

            Returns:
                Playlist details including tracks
            """
            # Check if client is available
            if self.ytmusic_client is None:
                return {
                    "success": False,
                    "error": "YouTube Music client not initialized. Please check your OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) in Smithery settings.",
                }

            try:
                # Get playlist details using direct authentication
                playlist = await self.ytmusic_client.get_playlist_details(
                    playlist_id, limit
                )

                return {
                    "success": True,
                    "playlist": playlist,
                }

            except Exception as e:
                self.logger.error(
                    "Get playlist details failed", playlist_id=playlist_id, error=str(e)
                )
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


def create_server() -> YouTubeMusicMCPServer:
    """
    Create and configure the YouTube Music MCP server.

    Returns:
        Configured server instance
    """
    # Load configuration from environment (user-provided credentials)
    server_config = ServerConfig(
        client_id=os.getenv("CLIENT_ID", ""),
        client_secret=os.getenv("CLIENT_SECRET", ""),
        refresh_token=os.getenv("REFRESH_TOKEN", ""),
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
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    def main():
        import uvicorn
        from starlette.middleware.cors import CORSMiddleware
        from starlette.applications import Starlette
        from starlette.routing import Mount, Route
        from starlette.responses import JSONResponse

        # Create server instance
        server = create_server()

        # Get the Starlette app from FastMCP
        mcp_app = server.mcp.streamable_http_app()

        # Get port
        port = int(os.getenv("PORT", "8081"))

        # Health endpoint for the main app
        async def health_endpoint(request):
            """Health check endpoint for Docker and load balancers."""
            try:
                health_status = await server.health_checker.get_health_status()
                return JSONResponse(
                    {
                        "status": "healthy",
                        "service": "YouTube Music MCP Server",
                        "version": "2.0.0",
                        "health": health_status,
                        "timestamp": asyncio.get_event_loop().time(),
                    }
                )
            except Exception as e:
                server.logger.error("Health endpoint error", error=str(e))
                return JSONResponse(
                    {"status": "unhealthy", "error": str(e)}, status_code=503
                )

        # MCP JSON-RPC endpoint
        async def mcp_endpoint(request):
            """Handle MCP JSON-RPC requests directly."""
            try:
                body = await request.json()

                # Handle initialize request
                if body.get("method") == "initialize":
                    return JSONResponse(
                        {
                            "jsonrpc": "2.0",
                            "id": body.get("id"),
                            "result": {
                                "protocolVersion": "2025-06-18",
                                "capabilities": {
                                    "tools": {},
                                    "logging": {},
                                    "sampling": {},
                                },
                                "serverInfo": {
                                    "name": "YouTube Music MCP Server",
                                    "version": "2.0.0",
                                },
                            },
                        }
                    )

                # Handle tools/list request
                elif body.get("method") == "tools/list":
                    tools = []
                    for tool in server.mcp._tools:
                        tools.append(
                            {
                                "name": tool.name,
                                "description": tool.description or "",
                                "inputSchema": tool.parameters or {},
                            }
                        )

                    return JSONResponse(
                        {
                            "jsonrpc": "2.0",
                            "id": body.get("id"),
                            "result": {"tools": tools},
                        }
                    )

                # Handle tool calls
                elif body.get("method") == "tools/call":
                    params = body.get("params", {})
                    tool_name = params.get("name")
                    arguments = params.get("arguments", {})

                    # Find and call the tool
                    for tool in server.mcp._tools:
                        if tool.name == tool_name:
                            try:
                                result = await tool.handler(**arguments)
                                return JSONResponse(
                                    {
                                        "jsonrpc": "2.0",
                                        "id": body.get("id"),
                                        "result": {
                                            "content": [
                                                {"type": "text", "text": str(result)}
                                            ]
                                        },
                                    }
                                )
                            except Exception as e:
                                return JSONResponse(
                                    {
                                        "jsonrpc": "2.0",
                                        "id": body.get("id"),
                                        "error": {
                                            "code": -32603,
                                            "message": f"Tool execution failed: {str(e)}",
                                        },
                                    }
                                )

                    return JSONResponse(
                        {
                            "jsonrpc": "2.0",
                            "id": body.get("id"),
                            "error": {
                                "code": -32601,
                                "message": f"Tool not found: {tool_name}",
                            },
                        }
                    )

                else:
                    return JSONResponse(
                        {
                            "jsonrpc": "2.0",
                            "id": body.get("id"),
                            "error": {
                                "code": -32601,
                                "message": f"Method not found: {body.get('method')}",
                            },
                        }
                    )

            except Exception as e:
                server.logger.error("MCP endpoint error", error=str(e))
                return JSONResponse(
                    {
                        "jsonrpc": "2.0",
                        "id": body.get("id") if hasattr(body, "get") else None,
                        "error": {
                            "code": -32603,
                            "message": f"Internal error: {str(e)}",
                        },
                    },
                    status_code=500,
                )

        # Create simple application - no OAuth server needed since users provide their own credentials
        app = Starlette(
            routes=[
                Route("/health", health_endpoint, methods=["GET"]),
                Route("/mcp", mcp_endpoint, methods=["POST"]),
                Route("/mcp/", mcp_endpoint, methods=["POST"]),  # Handle trailing slash
            ]
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
