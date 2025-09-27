#!/usr/bin/env python3
"""
Unified YouTube Music MCP Server with OAuth Support
Implements full MCP protocol with HTTP transport and SSE
"""

import os
import sys
import json
import logging
import asyncio
import uuid
from typing import Dict, Optional, Any, List
from pathlib import Path
from dataclasses import dataclass
import time

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from oauth_handler import OAuthHandler
from ytmusicapi import YTMusic
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OAuth handler
oauth_handler = OAuthHandler()

@dataclass
class MCPSession:
    """MCP Session state"""
    session_id: str
    access_token: Optional[str] = None
    ytmusic: Optional[YTMusic] = None
    initialized: bool = False
    client_info: Dict = None
    message_queue: asyncio.Queue = None

    def __post_init__(self):
        if self.message_queue is None:
            self.message_queue = asyncio.Queue()

# Global session storage
mcp_sessions: Dict[str, MCPSession] = {}

def get_or_create_session(session_id: str) -> MCPSession:
    """Get or create an MCP session"""
    if session_id not in mcp_sessions:
        mcp_sessions[session_id] = MCPSession(session_id=session_id)
    return mcp_sessions[session_id]

def get_ytmusic_for_token(access_token: str) -> Optional[YTMusic]:
    """Get or create YTMusic instance for an access token"""
    # Get YouTube tokens from OAuth session
    youtube_tokens = oauth_handler.get_youtube_tokens(access_token)

    if not youtube_tokens:
        logger.error(f"No YouTube tokens found for access token")
        return None

    try:
        # Parse the tokens
        tokens_data = json.loads(youtube_tokens)

        # Create temporary browser.json file
        import tempfile
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

        logger.info(f"Created YTMusic instance for access token")
        return yt

    except Exception as e:
        logger.error(f"Failed to create YTMusic instance: {e}")
        return None

# OAuth Routes for MCP Protocol
async def oauth_authorize(request: Request):
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

async def oauth_token(request: Request):
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

async def oauth_refresh(request: Request):
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

# MCP Protocol Implementation
def get_tools_list() -> List[Dict]:
    """Return the list of available tools"""
    return [
        {
            "name": "search_music",
            "description": "Search for songs, albums, artists, playlists",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "filter": {"type": "string", "description": "Filter: songs, albums, artists, playlists"},
                    "limit": {"type": "integer", "description": "Number of results", "default": 20}
                },
                "required": ["query"]
            }
        },
        {
            "name": "create_playlist",
            "description": "Create a new playlist",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Playlist title"},
                    "description": {"type": "string", "description": "Playlist description"},
                    "privacy": {"type": "string", "enum": ["PRIVATE", "PUBLIC", "UNLISTED"]}
                },
                "required": ["title"]
            }
        },
        {
            "name": "add_songs_to_playlist",
            "description": "Add songs to a playlist",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "playlist_id": {"type": "string", "description": "Playlist ID"},
                    "video_ids": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["playlist_id", "video_ids"]
            }
        },
        {
            "name": "get_playlists",
            "description": "Get user's playlists",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 25}
                }
            }
        }
    ]

async def handle_mcp_request(session: MCPSession, request_data: Dict) -> Dict:
    """Handle MCP JSON-RPC request"""
    method = request_data.get("method")
    params = request_data.get("params", {})
    request_id = request_data.get("id")

    logger.info(f"Handling MCP request: {method}")

    # Build base response
    response = {"jsonrpc": "2.0"}
    if request_id is not None:
        response["id"] = request_id

    try:
        if method == "initialize":
            # Handle initialization
            session.client_info = params.get("clientInfo", {})
            session.initialized = True

            response["result"] = {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "youtube-music-mcp",
                    "version": "1.0.0"
                }
            }

        elif method == "initialized":
            # Client has acknowledged initialization
            logger.info("MCP session initialized")
            return None  # No response needed for notifications

        elif method == "tools/list":
            # Return available tools
            response["result"] = {
                "tools": get_tools_list()
            }

        elif method == "tools/call":
            # Execute tool
            if not session.ytmusic:
                raise Exception("Not authenticated. Please complete OAuth flow first.")

            tool_name = params.get("name")
            arguments = params.get("arguments", {})

            result = await execute_tool(session.ytmusic, tool_name, arguments)
            response["result"] = result

        else:
            # Method not found
            response["error"] = {
                "code": -32601,
                "message": f"Method not found: {method}"
            }

    except Exception as e:
        logger.error(f"Error handling MCP request: {e}")
        response["error"] = {
            "code": -32603,
            "message": str(e)
        }

    return response

async def execute_tool(yt: YTMusic, tool_name: str, arguments: Dict) -> Dict:
    """Execute a tool with YTMusic instance"""
    try:
        if tool_name == "search_music":
            results = yt.search(
                arguments.get("query"),
                filter=arguments.get("filter"),
                limit=arguments.get("limit", 20)
            )
            return {
                "content": [{"type": "text", "text": json.dumps(results, indent=2)}]
            }

        elif tool_name == "create_playlist":
            playlist_id = yt.create_playlist(
                arguments.get("title"),
                arguments.get("description", ""),
                arguments.get("privacy", "PRIVATE")
            )
            return {
                "content": [{
                    "type": "text",
                    "text": f"Created playlist with ID: {playlist_id}"
                }]
            }

        elif tool_name == "add_songs_to_playlist":
            result = yt.add_playlist_items(
                arguments.get("playlist_id"),
                arguments.get("video_ids", [])
            )
            return {
                "content": [{
                    "type": "text",
                    "text": f"Added songs to playlist: {json.dumps(result)}"
                }]
            }

        elif tool_name == "get_playlists":
            playlists = yt.get_library_playlists(
                limit=arguments.get("limit", 25)
            )
            return {
                "content": [{
                    "type": "text",
                    "text": json.dumps(playlists, indent=2)
                }]
            }

        else:
            raise ValueError(f"Unknown tool: {tool_name}")

    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {e}")
        raise

# Main MCP endpoint
async def mcp_handler(request: Request):
    """Main MCP endpoint that handles JSON-RPC requests"""
    # Get session ID from header
    session_id = request.headers.get('mcp-session-id', str(uuid.uuid4()))
    session = get_or_create_session(session_id)

    # Check for Authorization header
    auth_header = request.headers.get('authorization', '')

    # Get request body
    try:
        mcp_request = await request.json()
    except:
        mcp_request = {}

    # Check which method is being called
    method = mcp_request.get("method")

    # Allow these methods without authentication (for Smithery scanning)
    unauthenticated_methods = ["initialize", "initialized", "tools/list"]

    # Check if this is an unauthenticated method
    if method in unauthenticated_methods:
        # Allow these methods without auth
        response = await handle_mcp_request(session, mcp_request)
        if response:
            return JSONResponse(response, headers={"Mcp-Session-Id": session_id})
        return Response(status_code=202, headers={"Mcp-Session-Id": session_id})

    # For authenticated methods, check authentication
    if auth_header.startswith('Bearer '):
        access_token = auth_header[7:]

        # Initialize YTMusic if not already done
        if not session.ytmusic:
            session.access_token = access_token
            session.ytmusic = get_ytmusic_for_token(access_token)

            if not session.ytmusic:
                return JSONResponse(
                    {
                        "jsonrpc": "2.0",
                        "error": {
                            "code": -32001,
                            "message": "Failed to authenticate with YouTube Music"
                        },
                        "id": mcp_request.get("id")
                    },
                    status_code=401
                )
    else:
        # No authentication provided for methods that require it
        return JSONResponse(
            {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32001,
                    "message": "Authentication required. Please complete OAuth flow."
                },
                "id": mcp_request.get("id")
            },
            status_code=401,
            headers={
                "WWW-Authenticate": 'Bearer realm="YouTube Music MCP"'
            }
        )

    # Handle the MCP request
    response = await handle_mcp_request(session, mcp_request)

    if response:
        return JSONResponse(response, headers={"Mcp-Session-Id": session_id})

    # No response for notifications
    return Response(status_code=202, headers={"Mcp-Session-Id": session_id})

# SSE endpoint for server-to-client messages
async def sse_handler(request: Request):
    """SSE endpoint for streaming server-to-client messages"""
    session_id = request.headers.get('mcp-session-id')
    if not session_id:
        return Response(status_code=400)

    session = get_or_create_session(session_id)

    async def event_generator():
        """Generate SSE events"""
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connection', 'status': 'connected'})}\n\n"

            # Keep connection alive and send queued messages
            while True:
                try:
                    # Wait for messages with timeout for keep-alive
                    message = await asyncio.wait_for(
                        session.message_queue.get(),
                        timeout=30.0
                    )
                    yield f"data: {json.dumps(message)}\n\n"
                except asyncio.TimeoutError:
                    # Send keep-alive ping
                    yield f": ping\n\n"

        except asyncio.CancelledError:
            logger.info(f"SSE connection closed for session {session_id}")
            raise

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )

# Health check endpoint
async def health_check(request: Request):
    """Health check endpoint"""
    return JSONResponse({"status": "healthy", "service": "youtube-music-mcp"})

# Create Starlette app with routes
routes = [
    Route('/health', health_check, methods=['GET']),
    Route('/oauth/authorize', oauth_authorize, methods=['GET']),
    Route('/oauth/token', oauth_token, methods=['POST']),
    Route('/oauth/refresh', oauth_refresh, methods=['POST']),
    Route('/sse', sse_handler, methods=['GET']),
    Route('/mcp', mcp_handler, methods=['POST']),
    Route('/', mcp_handler, methods=['POST', 'GET']),
]

# Add CORS middleware for browser-based clients
middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_methods=['*'],
        allow_headers=['*'],
        expose_headers=['Mcp-Session-Id'],
    )
]

app = Starlette(
    debug=True,
    routes=routes,
    middleware=middleware
)

def main():
    """Main entry point"""
    port = int(os.environ.get("PORT", 8081))
    host = os.environ.get("HOST", "0.0.0.0")

    logger.info(f"Starting YouTube Music MCP Server with OAuth on {host}:{port}")
    logger.info("MCP endpoints: POST /, GET /sse")
    logger.info("OAuth endpoints: GET /oauth/authorize, POST /oauth/token, POST /oauth/refresh")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    main()
