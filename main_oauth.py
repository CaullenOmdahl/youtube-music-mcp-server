#!/usr/bin/env python3
"""
Main entry point for YouTube Music MCP Server with OAuth support
Compatible with Smithery's OAuth client example
"""

import os
import sys
import json
import logging
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse, Response
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from oauth_handler import OAuthHandler
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OAuth handler
oauth_handler = OAuthHandler()

# OAuth Routes for MCP Protocol

async def oauth_authorize(request):
    """
    OAuth Authorization endpoint
    Called by MCP client to get authorization URL
    """
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
    """
    OAuth Token endpoint
    Exchange authorization code for tokens
    """
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
    except ValueError as e:
        return JSONResponse(
            {"error": "invalid_grant", "error_description": str(e)},
            status_code=400
        )
    except Exception as e:
        logger.error(f"Token exchange error: {e}")
        return JSONResponse(
            {"error": "server_error", "error_description": str(e)},
            status_code=500
        )

async def oauth_refresh(request):
    """
    OAuth Refresh endpoint
    Refresh access token using refresh token
    """
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

async def mcp_handler(request):
    """
    Main MCP endpoint that checks for OAuth authentication
    """
    # Check for Authorization header
    auth_header = request.headers.get('authorization', '')

    if not auth_header.startswith('Bearer '):
        # No auth - return 401 with OAuth information
        return JSONResponse(
            {
                "error": "unauthorized",
                "error_description": "Authentication required",
                "auth_type": "oauth2",
                "auth_url": "/oauth/authorize"
            },
            status_code=401,
            headers={
                "WWW-Authenticate": 'Bearer realm="YouTube Music MCP", error="invalid_token"'
            }
        )

    # Extract token
    access_token = auth_header[7:]

    # Get YouTube tokens for this session
    youtube_tokens = oauth_handler.get_youtube_tokens(access_token)

    if not youtube_tokens:
        return JSONResponse(
            {"error": "invalid_token", "error_description": "Token not found or expired"},
            status_code=401
        )

    # Get request body (MCP JSON-RPC request)
    try:
        mcp_request = await request.json()
    except:
        mcp_request = {}

    # Import the bridge and handle the request
    from mcp_oauth_integration import OAuthMCPBridge
    bridge = OAuthMCPBridge(oauth_handler)

    # Process MCP request with OAuth context
    result = bridge.handle_mcp_request(mcp_request, access_token)

    # Return MCP response
    return JSONResponse(result)

# Create Starlette app with routes
routes = [
    Route('/oauth/authorize', oauth_authorize, methods=['GET']),
    Route('/oauth/token', oauth_token, methods=['POST']),
    Route('/oauth/refresh', oauth_refresh, methods=['POST']),
    Route('/mcp', mcp_handler, methods=['POST']),
    Route('/', mcp_handler, methods=['POST']),  # Main MCP endpoint
]

# Add CORS middleware for browser-based clients
middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_methods=['*'],
        allow_headers=['*'],
    )
]

app = Starlette(
    debug=True,
    routes=routes,
    middleware=middleware
)

def main():
    """Main entry point"""
    transport_mode = os.environ.get("TRANSPORT", "stdio")

    if transport_mode == "http":
        # Run HTTP server with OAuth support
        port = int(os.environ.get("PORT", 8080))
        host = os.environ.get("HOST", "0.0.0.0")

        logger.info(f"Starting YouTube Music MCP Server with OAuth on {host}:{port}")

        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level="info"
        )
    else:
        # Run stdio mode (no OAuth)
        logger.info("Running in stdio mode (OAuth not available)")
        # Import and run the original server
        from ytmusic_server.server import create_server
        server = create_server()
        # Run in stdio mode
        import asyncio
        from mcp import stdio_server
        asyncio.run(stdio_server(server))

if __name__ == "__main__":
    main()
