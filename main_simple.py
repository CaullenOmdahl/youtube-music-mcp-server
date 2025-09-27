#!/usr/bin/env python3
"""
Simplified YouTube Music MCP Server
Focus on getting MCP protocol working first
"""

import os
import json
import logging
from typing import Optional
from pathlib import Path

# FastMCP - the proper way for Python MCP servers
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP(name="YouTube Music MCP")

# Simple test tools first (no auth required)
@mcp.tool()
def test_connection() -> str:
    """Test that the MCP server is working"""
    return "YouTube Music MCP Server is connected and working!"

@mcp.tool()
def search_music_test(query: str) -> str:
    """
    Test search endpoint (returns mock data)

    Args:
        query: Search query string
    """
    # Return mock data for testing
    mock_results = {
        "query": query,
        "results": [
            {"title": f"Song matching '{query}' #1", "artist": "Test Artist 1"},
            {"title": f"Song matching '{query}' #2", "artist": "Test Artist 2"},
        ],
        "status": "This is test data - OAuth not yet configured"
    }
    return json.dumps(mock_results, indent=2)

@mcp.tool()
def list_available_features() -> str:
    """List all planned features of this MCP server"""
    features = {
        "implemented": [
            "test_connection - Test server connectivity",
            "search_music_test - Mock search with test data",
            "list_available_features - This tool"
        ],
        "planned": [
            "search_music - Real YouTube Music search",
            "create_playlist - Create new playlists",
            "add_songs_to_playlist - Add songs to playlists",
            "get_playlists - List user's playlists",
            "get_playlist - Get playlist details"
        ],
        "authentication": "OAuth with Google (not yet configured)"
    }
    return json.dumps(features, indent=2)

def main():
    """Main entry point"""
    transport_mode = os.getenv("TRANSPORT", "stdio")

    if transport_mode == "http":
        print("YouTube Music MCP Server starting in HTTP mode...")

        # Use FastMCP's built-in HTTP transport
        port = int(os.environ.get("PORT", 8081))
        host = os.environ.get("HOST", "0.0.0.0")

        # Get the streamable HTTP app
        app = mcp.streamable_http_app()

        # Add CORS middleware
        from starlette.middleware.cors import CORSMiddleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
            expose_headers=["mcp-session-id", "mcp-protocol-version"],
            max_age=86400,
        )

        # Run with uvicorn
        import uvicorn
        uvicorn.run(app, host=host, port=port, log_level="info")
    else:
        # Run in stdio mode for local testing
        print("YouTube Music MCP Server starting in stdio mode...")
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
