#!/usr/bin/env python3
"""
YouTube Music MCP Server - Minimal FastMCP Implementation
"""

import os
import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.middleware.cors import CORSMiddleware

# Initialize FastMCP server
mcp = FastMCP(name="YouTube Music MCP")

@mcp.tool()
def test_connection() -> str:
    """Test that the MCP server is working"""
    return "YouTube Music MCP Server is connected!"

@mcp.tool()
def search_music_mock(query: str) -> str:
    """
    Mock search for testing (OAuth not configured yet)

    Args:
        query: Search query
    """
    return f"Mock results for: {query}. OAuth authentication will be added soon."

@mcp.tool()
def list_features() -> str:
    """List planned features"""
    return """
    Planned features:
    - search_music: Search YouTube Music
    - create_playlist: Create playlists
    - add_songs_to_playlist: Add songs
    - get_playlists: List playlists
    """

def main():
    """Main entry point"""
    print("YouTube Music MCP Server starting...")

    # Get the app with CORS
    app = mcp.streamable_http_app()

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["mcp-session-id", "mcp-protocol-version"],
        max_age=86400,
    )

    # Get port from environment (Smithery sets this)
    port = int(os.environ.get("PORT", 8081))

    print(f"Server listening on port {port}")
    print("MCP endpoint: /mcp")

    # Run server
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

if __name__ == "__main__":
    main()
