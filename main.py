#!/usr/bin/env python3
"""
YouTube Music MCP Server with OAuth Authentication
"""

import os
import json
import logging
from typing import Optional, Dict, Any
from pathlib import Path
from datetime import datetime, timedelta
import tempfile
import secrets
from urllib.parse import urlencode

# FastMCP - the proper way for Python MCP servers
from mcp.server.fastmcp import FastMCP
from starlette.routing import Route
from starlette.responses import JSONResponse, HTMLResponse, RedirectResponse
from starlette.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic
import httpx
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP(name="YouTube Music MCP")

# Function to get config from Smithery
def get_smithery_config():
    """Get configuration from Smithery's config parameter or environment variables"""
    # Try to get from Smithery's base64-encoded config parameter
    import sys
    for arg in sys.argv:
        if arg.startswith('--config='):
            try:
                import base64
                config_str = arg.split('=', 1)[1]
                config_data = json.loads(base64.b64decode(config_str).decode())
                return {
                    "client_id": config_data.get("googleClientId", ""),
                    "client_secret": config_data.get("googleClientSecret", "")
                }
            except:
                pass

    # Fall back to environment variables
    # Smithery sets config values as environment variables
    return {
        "client_id": os.getenv("googleClientId", os.getenv("GOOGLE_CLIENT_ID", "")),
        "client_secret": os.getenv("googleClientSecret", os.getenv("GOOGLE_CLIENT_SECRET", ""))
    }

# OAuth configuration
smithery_config = get_smithery_config()
OAUTH_CONFIG = {
    "client_id": smithery_config["client_id"],
    "client_secret": smithery_config["client_secret"],
    "redirect_uri": os.getenv("OAUTH_REDIRECT_URI", "http://localhost:8081/oauth/callback"),
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "scope": "https://www.googleapis.com/auth/youtube"
}

# Log OAuth configuration status
if OAUTH_CONFIG["client_id"] and OAUTH_CONFIG["client_secret"]:
    logger.info(f"OAuth configured with client_id: {OAUTH_CONFIG['client_id'][:30]}...")
else:
    logger.warning("OAuth credentials not configured. YouTube Music features require authentication.")
    logger.warning("Configure googleClientId and googleClientSecret in Smithery or set as environment variables")

# In-memory storage for OAuth tokens (use a database in production)
oauth_tokens = {}
pending_auth = {}

class SimpleOAuthHandler:
    """Simple OAuth handler for Google/YouTube authentication"""

    def __init__(self):
        self.sessions = {}

    def create_auth_url(self, state: str) -> str:
        """Create Google OAuth authorization URL"""
        params = {
            "client_id": OAUTH_CONFIG["client_id"],
            "redirect_uri": OAUTH_CONFIG["redirect_uri"],
            "response_type": "code",
            "scope": OAUTH_CONFIG["scope"],
            "state": state,
            "access_type": "offline",
            "prompt": "consent"
        }
        return f"{OAUTH_CONFIG['auth_uri']}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> Dict[str, Any]:
        """Exchange authorization code for tokens"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                OAUTH_CONFIG["token_uri"],
                data={
                    "code": code,
                    "client_id": OAUTH_CONFIG["client_id"],
                    "client_secret": OAUTH_CONFIG["client_secret"],
                    "redirect_uri": OAUTH_CONFIG["redirect_uri"],
                    "grant_type": "authorization_code"
                }
            )
            return response.json()

    async def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """Refresh access token"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                OAUTH_CONFIG["token_uri"],
                data={
                    "refresh_token": refresh_token,
                    "client_id": OAUTH_CONFIG["client_id"],
                    "client_secret": OAUTH_CONFIG["client_secret"],
                    "grant_type": "refresh_token"
                }
            )
            return response.json()

oauth_handler = SimpleOAuthHandler()

def get_ytmusic_client(session_id: Optional[str] = None) -> Optional[YTMusic]:
    """Get YTMusic client for a session"""
    if not session_id or session_id not in oauth_tokens:
        return None

    token_data = oauth_tokens.get(session_id)
    if not token_data:
        return None

    # Check if token is expired
    if token_data.get("expires_at", 0) < datetime.now().timestamp():
        # Token expired, would need to refresh here
        return None

    # Create YTMusic client with OAuth token
    # Note: ytmusicapi requires a specific auth format
    auth_file = Path(tempfile.gettempdir()) / f"ytmusic_auth_{session_id}.json"
    auth_data = {
        "access_token": token_data["access_token"],
        "refresh_token": token_data.get("refresh_token"),
        "expires_at": token_data.get("expires_at"),
        "token_type": "Bearer"
    }
    auth_file.write_text(json.dumps(auth_data))

    try:
        return YTMusic(auth_file.as_posix())
    except Exception as e:
        logger.error(f"Failed to create YTMusic client: {e}")
        return None

# Test tools (no auth required)
@mcp.tool()
def test_connection() -> str:
    """Test that the MCP server is working"""
    return "YouTube Music MCP Server is connected!"

@mcp.tool()
def get_auth_status(session_id: Optional[str] = None) -> str:
    """Check if user is authenticated"""
    if not session_id or session_id not in oauth_tokens:
        return json.dumps({
            "authenticated": False,
            "message": "Not authenticated. Please complete OAuth flow."
        })

    token_data = oauth_tokens.get(session_id, {})
    expires_at = token_data.get("expires_at", 0)
    is_expired = expires_at < datetime.now().timestamp()

    return json.dumps({
        "authenticated": True,
        "expired": is_expired,
        "expires_at": datetime.fromtimestamp(expires_at).isoformat() if expires_at else None
    })

# YouTube Music tools (require auth)
@mcp.tool()
def search_music(query: str, session_id: Optional[str] = None) -> str:
    """
    Search for music on YouTube Music

    Args:
        query: Search query string
        session_id: Session ID for authentication
    """
    ytmusic = get_ytmusic_client(session_id)
    if not ytmusic:
        return json.dumps({
            "error": "Not authenticated",
            "message": "Please authenticate first"
        })

    try:
        results = ytmusic.search(query, filter="songs", limit=10)
        formatted_results = []
        for item in results:
            formatted_results.append({
                "title": item.get("title"),
                "artist": item.get("artists", [{}])[0].get("name") if item.get("artists") else None,
                "album": item.get("album", {}).get("name") if item.get("album") else None,
                "videoId": item.get("videoId"),
                "duration": item.get("duration")
            })
        return json.dumps({"results": formatted_results})
    except Exception as e:
        return json.dumps({"error": str(e)})

@mcp.tool()
def create_playlist(name: str, description: str = "", session_id: Optional[str] = None) -> str:
    """
    Create a new playlist

    Args:
        name: Playlist name
        description: Playlist description
        session_id: Session ID for authentication
    """
    ytmusic = get_ytmusic_client(session_id)
    if not ytmusic:
        return json.dumps({
            "error": "Not authenticated",
            "message": "Please authenticate first"
        })

    try:
        playlist_id = ytmusic.create_playlist(name, description)
        return json.dumps({
            "success": True,
            "playlist_id": playlist_id,
            "name": name
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@mcp.tool()
def add_songs_to_playlist(playlist_id: str, video_ids: list, session_id: Optional[str] = None) -> str:
    """
    Add songs to a playlist

    Args:
        playlist_id: Playlist ID
        video_ids: List of video IDs to add
        session_id: Session ID for authentication
    """
    ytmusic = get_ytmusic_client(session_id)
    if not ytmusic:
        return json.dumps({
            "error": "Not authenticated",
            "message": "Please authenticate first"
        })

    try:
        result = ytmusic.add_playlist_items(playlist_id, video_ids)
        return json.dumps({
            "success": True,
            "added_count": len(video_ids),
            "playlist_id": playlist_id
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@mcp.tool()
def get_playlists(session_id: Optional[str] = None) -> str:
    """
    Get user's playlists

    Args:
        session_id: Session ID for authentication
    """
    ytmusic = get_ytmusic_client(session_id)
    if not ytmusic:
        return json.dumps({
            "error": "Not authenticated",
            "message": "Please authenticate first"
        })

    try:
        playlists = ytmusic.get_library_playlists()
        formatted_playlists = []
        for playlist in playlists:
            formatted_playlists.append({
                "title": playlist.get("title"),
                "playlistId": playlist.get("playlistId"),
                "count": playlist.get("count")
            })
        return json.dumps({"playlists": formatted_playlists})
    except Exception as e:
        return json.dumps({"error": str(e)})

@mcp.tool()
def get_playlist_details(playlist_id: str, session_id: Optional[str] = None) -> str:
    """
    Get detailed information about a playlist

    Args:
        playlist_id: Playlist ID
        session_id: Session ID for authentication
    """
    ytmusic = get_ytmusic_client(session_id)
    if not ytmusic:
        return json.dumps({
            "error": "Not authenticated",
            "message": "Please authenticate first"
        })

    try:
        playlist = ytmusic.get_playlist(playlist_id)
        tracks = []
        for track in playlist.get("tracks", []):
            tracks.append({
                "title": track.get("title"),
                "artist": track.get("artists", [{}])[0].get("name") if track.get("artists") else None,
                "videoId": track.get("videoId"),
                "duration": track.get("duration")
            })

        return json.dumps({
            "title": playlist.get("title"),
            "description": playlist.get("description"),
            "track_count": len(tracks),
            "tracks": tracks
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

# OAuth routes
async def oauth_authorize(request):
    """Start OAuth flow"""
    state = secrets.token_urlsafe(32)
    session_id = request.headers.get("mcp-session-id", secrets.token_urlsafe(32))

    pending_auth[state] = {
        "session_id": session_id,
        "created_at": datetime.now().timestamp()
    }

    auth_url = oauth_handler.create_auth_url(state)

    # Return HTML with redirect
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>YouTube Music MCP - Authorization</title>
    </head>
    <body>
        <h2>YouTube Music MCP Server</h2>
        <p>Click the button below to authorize access to your YouTube Music account:</p>
        <a href="{auth_url}" style="display:inline-block;padding:10px 20px;background:#4285f4;color:white;text-decoration:none;border-radius:4px;">
            Authorize with Google
        </a>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

async def oauth_callback(request):
    """Handle OAuth callback"""
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    if error:
        return JSONResponse({
            "error": error,
            "description": request.query_params.get("error_description", "OAuth authorization failed")
        }, status_code=400)

    if not code or not state:
        return JSONResponse({
            "error": "missing_parameters",
            "description": "Missing code or state parameter"
        }, status_code=400)

    # Verify state
    auth_info = pending_auth.pop(state, None)
    if not auth_info:
        return JSONResponse({
            "error": "invalid_state",
            "description": "Invalid or expired state parameter"
        }, status_code=400)

    try:
        # Exchange code for tokens
        token_data = await oauth_handler.exchange_code(code)

        # Store tokens
        session_id = auth_info["session_id"]
        oauth_tokens[session_id] = {
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token"),
            "expires_at": datetime.now().timestamp() + token_data.get("expires_in", 3600),
            "token_type": token_data.get("token_type", "Bearer")
        }

        # Return success page
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authorization Successful</title>
        </head>
        <body>
            <h2>Authorization Successful!</h2>
            <p>You can now close this window and return to your MCP client.</p>
            <script>
                setTimeout(() => window.close(), 3000);
            </script>
        </body>
        </html>
        """
        return HTMLResponse(content=html)

    except Exception as e:
        logger.error(f"Token exchange failed: {e}")
        return JSONResponse({
            "error": "token_exchange_failed",
            "description": str(e)
        }, status_code=500)

async def oauth_token(request):
    """Get current token info"""
    session_id = request.headers.get("mcp-session-id")
    if not session_id or session_id not in oauth_tokens:
        return JSONResponse({
            "error": "not_authenticated",
            "description": "No valid session found"
        }, status_code=401)

    token_data = oauth_tokens[session_id]
    return JSONResponse({
        "access_token": token_data["access_token"],
        "expires_at": token_data["expires_at"],
        "token_type": token_data["token_type"]
    })

async def oauth_refresh(request):
    """Refresh access token"""
    session_id = request.headers.get("mcp-session-id")
    if not session_id or session_id not in oauth_tokens:
        return JSONResponse({
            "error": "not_authenticated",
            "description": "No valid session found"
        }, status_code=401)

    token_data = oauth_tokens[session_id]
    refresh_token = token_data.get("refresh_token")

    if not refresh_token:
        return JSONResponse({
            "error": "no_refresh_token",
            "description": "No refresh token available"
        }, status_code=400)

    try:
        new_token_data = await oauth_handler.refresh_token(refresh_token)

        # Update stored tokens
        oauth_tokens[session_id].update({
            "access_token": new_token_data["access_token"],
            "expires_at": datetime.now().timestamp() + new_token_data.get("expires_in", 3600)
        })

        return JSONResponse({
            "access_token": new_token_data["access_token"],
            "expires_at": oauth_tokens[session_id]["expires_at"]
        })

    except Exception as e:
        logger.error(f"Token refresh failed: {e}")
        return JSONResponse({
            "error": "refresh_failed",
            "description": str(e)
        }, status_code=500)

def main():
    """Main entry point"""
    transport_mode = os.getenv("TRANSPORT", "stdio")

    if transport_mode == "http":
        logger.info("YouTube Music MCP Server starting in HTTP mode...")

        # Use FastMCP's built-in HTTP transport
        port = int(os.environ.get("PORT", 8081))
        host = os.environ.get("HOST", "0.0.0.0")

        # Get the streamable HTTP app
        app = mcp.streamable_http_app()

        # Add OAuth routes
        oauth_routes = [
            Route("/oauth/authorize", oauth_authorize, methods=["GET"]),
            Route("/oauth/callback", oauth_callback, methods=["GET"]),
            Route("/oauth/token", oauth_token, methods=["GET", "POST"]),
            Route("/oauth/refresh", oauth_refresh, methods=["POST"])
        ]

        # Add OAuth routes to the app
        app.routes.extend(oauth_routes)

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

        # Run with uvicorn
        uvicorn.run(app, host=host, port=port, log_level="info")
    else:
        # Run in stdio mode for local testing
        logger.info("YouTube Music MCP Server starting in stdio mode...")
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
