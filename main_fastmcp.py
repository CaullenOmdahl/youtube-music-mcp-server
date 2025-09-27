#!/usr/bin/env python3
"""
YouTube Music MCP Server using FastMCP
Properly implements MCP protocol with OAuth support for Smithery
"""

import os
import json
import logging
from typing import Optional, Dict, Any
from pathlib import Path
import tempfile

# FastMCP imports
from mcp.server.fastmcp import FastMCP
from starlette.middleware.cors import CORSMiddleware
import uvicorn

# YouTube Music
from ytmusicapi import YTMusic

# OAuth handling
from oauth_handler import OAuthHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP(name="YouTube Music MCP Server")

# Initialize OAuth handler
oauth_handler = OAuthHandler()

# Cache for YTMusic instances per session
ytmusic_instances: Dict[str, YTMusic] = {}

def get_ytmusic_for_token(access_token: str) -> Optional[YTMusic]:
    """Get or create YTMusic instance for an access token"""
    if access_token in ytmusic_instances:
        return ytmusic_instances[access_token]

    # Get YouTube tokens from OAuth session
    youtube_tokens = oauth_handler.get_youtube_tokens(access_token)

    if not youtube_tokens:
        logger.error(f"No YouTube tokens found for access token")
        return None

    try:
        # Parse the tokens
        tokens_data = json.loads(youtube_tokens)

        # Create temporary browser.json file
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.json',
            delete=False
        ) as f:
            json.dump(tokens_data, f)
            temp_path = f.name

        # Initialize YTMusic with OAuth
        yt = YTMusic(temp_path)

        # Clean up temp file
        os.unlink(temp_path)

        # Cache the instance
        ytmusic_instances[access_token] = yt

        logger.info(f"Created YTMusic instance for access token")
        return yt

    except Exception as e:
        logger.error(f"Failed to create YTMusic instance: {e}")
        return None

def get_auth_token() -> Optional[str]:
    """Get auth token from request context"""
    try:
        from starlette.requests import HTTPConnection
        from contextvars import copy_context

        # Try to get current request from context
        context = copy_context()
        for var in context:
            value = var.get()
            if isinstance(value, HTTPConnection):
                auth_header = value.headers.get('authorization', '')
                if auth_header.startswith('Bearer '):
                    return auth_header[7:]
    except:
        pass
    return None

# Define MCP tools

@mcp.tool()
async def search_music(query: str, filter: Optional[str] = None, limit: Optional[int] = 20) -> str:
    """
    Search for songs, albums, artists, playlists on YouTube Music

    Args:
        query: Search query
        filter: Optional filter - one of: songs, albums, artists, playlists, community_playlists, featured_playlists
        limit: Maximum number of results (default: 20)
    """
    # Get auth token
    access_token = get_auth_token()
    if not access_token:
        return json.dumps({"error": "Authentication required. Please complete OAuth flow."})

    # Get YTMusic instance
    yt = get_ytmusic_for_token(access_token)
    if not yt:
        return json.dumps({"error": "Failed to authenticate with YouTube Music"})

    try:
        results = yt.search(query, filter=filter, limit=limit)
        return json.dumps(results, indent=2)
    except Exception as e:
        logger.error(f"Search error: {e}")
        return json.dumps({"error": str(e)})

@mcp.tool()
async def create_playlist(title: str, description: Optional[str] = "", privacy: Optional[str] = "PRIVATE") -> str:
    """
    Create a new playlist on YouTube Music

    Args:
        title: Playlist title
        description: Optional playlist description
        privacy: Privacy status - PRIVATE, PUBLIC, or UNLISTED (default: PRIVATE)
    """
    # Get auth token
    access_token = get_auth_token()
    if not access_token:
        return json.dumps({"error": "Authentication required. Please complete OAuth flow."})

    # Get YTMusic instance
    yt = get_ytmusic_for_token(access_token)
    if not yt:
        return json.dumps({"error": "Failed to authenticate with YouTube Music"})

    try:
        playlist_id = yt.create_playlist(title, description, privacy)
        return json.dumps({
            "success": True,
            "playlist_id": playlist_id,
            "message": f"Created playlist '{title}' with ID: {playlist_id}"
        })
    except Exception as e:
        logger.error(f"Create playlist error: {e}")
        return json.dumps({"error": str(e)})

@mcp.tool()
async def add_songs_to_playlist(playlist_id: str, video_ids: list[str]) -> str:
    """
    Add songs to an existing playlist

    Args:
        playlist_id: The playlist ID to add songs to
        video_ids: List of video/song IDs to add
    """
    # Get auth token
    access_token = get_auth_token()
    if not access_token:
        return json.dumps({"error": "Authentication required. Please complete OAuth flow."})

    # Get YTMusic instance
    yt = get_ytmusic_for_token(access_token)
    if not yt:
        return json.dumps({"error": "Failed to authenticate with YouTube Music"})

    try:
        result = yt.add_playlist_items(playlist_id, video_ids)
        return json.dumps({
            "success": True,
            "result": result,
            "message": f"Added {len(video_ids)} songs to playlist"
        })
    except Exception as e:
        logger.error(f"Add to playlist error: {e}")
        return json.dumps({"error": str(e)})

@mcp.tool()
async def get_playlists(limit: Optional[int] = 25) -> str:
    """
    Get user's playlists from YouTube Music library

    Args:
        limit: Maximum number of playlists to return (default: 25)
    """
    # Get auth token
    access_token = get_auth_token()
    if not access_token:
        return json.dumps({"error": "Authentication required. Please complete OAuth flow."})

    # Get YTMusic instance
    yt = get_ytmusic_for_token(access_token)
    if not yt:
        return json.dumps({"error": "Failed to authenticate with YouTube Music"})

    try:
        playlists = yt.get_library_playlists(limit=limit)
        return json.dumps(playlists, indent=2)
    except Exception as e:
        logger.error(f"Get playlists error: {e}")
        return json.dumps({"error": str(e)})

@mcp.tool()
async def get_playlist(playlist_id: str, limit: Optional[int] = None) -> str:
    """
    Get detailed information about a specific playlist

    Args:
        playlist_id: The playlist ID to get details for
        limit: Maximum number of tracks to return (optional)
    """
    # Get auth token
    access_token = get_auth_token()
    if not access_token:
        return json.dumps({"error": "Authentication required. Please complete OAuth flow."})

    # Get YTMusic instance
    yt = get_ytmusic_for_token(access_token)
    if not yt:
        return json.dumps({"error": "Failed to authenticate with YouTube Music"})

    try:
        playlist = yt.get_playlist(playlist_id, limit=limit)
        return json.dumps(playlist, indent=2)
    except Exception as e:
        logger.error(f"Get playlist error: {e}")
        return json.dumps({"error": str(e)})

# OAuth endpoints (for browser-based authentication)
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse

async def oauth_authorize(request):
    """OAuth Authorization endpoint"""
    redirect_uri = request.query_params.get('redirect_uri', 'http://localhost:3000/oauth/callback')

    try:
        result = oauth_handler.create_authorization_url(redirect_uri)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Authorization error: {e}")
        return JSONResponse(
            {"error": "authorization_error", "error_description": str(e)},
            status_code=500
        )

async def oauth_token(request):
    """OAuth Token endpoint"""
    try:
        data = await request.json()
        code = data.get('code')
        state = data.get('state')

        if not code or not state:
            return JSONResponse(
                {"error": "invalid_request", "error_description": "Missing code or state"},
                status_code=400
            )

        result = await oauth_handler.exchange_code_for_tokens(code, state)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Token exchange error: {e}")
        return JSONResponse(
            {"error": "server_error", "error_description": str(e)},
            status_code=500
        )

async def oauth_refresh(request):
    """OAuth Refresh endpoint"""
    try:
        data = await request.json()
        refresh_token = data.get('refresh_token')

        if not refresh_token:
            return JSONResponse(
                {"error": "invalid_request", "error_description": "Missing refresh_token"},
                status_code=400
            )

        result = await oauth_handler.refresh_access_token(refresh_token)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        return JSONResponse(
            {"error": "invalid_grant", "error_description": str(e)},
            status_code=400
        )

def main():
    """Main entry point for the server"""
    transport_mode = os.getenv("TRANSPORT", "http")

    if transport_mode == "http":
        print("YouTube Music MCP Server starting in HTTP mode...")

        # Get the FastMCP app with streamable HTTP support
        app = mcp.streamable_http_app()

        # Add OAuth routes
        oauth_routes = [
            Route('/oauth/authorize', oauth_authorize, methods=['GET']),
            Route('/oauth/token', oauth_token, methods=['POST']),
            Route('/oauth/refresh', oauth_refresh, methods=['POST']),
        ]

        # Add routes to the app
        app.routes.extend(oauth_routes)

        # IMPORTANT: Add CORS middleware for browser-based clients
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
            expose_headers=["mcp-session-id", "mcp-protocol-version"],
            max_age=86400,
        )

        # Get port from environment variable (Smithery sets this)
        port = int(os.environ.get("PORT", 8081))
        host = os.environ.get("HOST", "0.0.0.0")

        print(f"Server listening on {host}:{port}")
        print("OAuth endpoints: /oauth/authorize, /oauth/token, /oauth/refresh")
        print("MCP endpoint: / (POST)")

        # Run with uvicorn
        uvicorn.run(app, host=host, port=port, log_level="info")
    else:
        # Run in stdio mode for local development
        print("YouTube Music MCP Server starting in stdio mode...")
        mcp.run()

if __name__ == "__main__":
    main()
