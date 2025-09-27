"""
Integration between OAuth and MCP server
Connects the OAuth flow to the YouTube Music functionality
"""

import json
import tempfile
import os
from typing import Optional
from ytmusicapi import YTMusic
from oauth_handler import OAuthHandler
import logging

logger = logging.getLogger(__name__)

class OAuthMCPBridge:
    """
    Bridge between OAuth tokens and YTMusic instances
    """

    def __init__(self, oauth_handler: OAuthHandler):
        self.oauth_handler = oauth_handler
        self.ytmusic_instances = {}  # Cache YTMusic instances by access token

    def get_ytmusic_for_token(self, access_token: str) -> Optional[YTMusic]:
        """
        Get or create YTMusic instance for an access token
        """
        # Check cache
        if access_token in self.ytmusic_instances:
            return self.ytmusic_instances[access_token]

        # Get YouTube tokens from OAuth session
        youtube_tokens = self.oauth_handler.get_youtube_tokens(access_token)

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
            self.ytmusic_instances[access_token] = yt

            logger.info(f"Created YTMusic instance for access token")
            return yt

        except Exception as e:
            logger.error(f"Failed to create YTMusic instance: {e}")
            return None

    def handle_mcp_request(self, request_data: dict, access_token: str) -> dict:
        """
        Handle MCP request with OAuth authentication
        """
        # Get YTMusic instance
        yt = self.get_ytmusic_for_token(access_token)

        if not yt:
            return {
                "error": {
                    "code": -32001,
                    "message": "Authentication failed"
                }
            }

        # Extract MCP method and params
        method = request_data.get("method", "")
        params = request_data.get("params", {})

        # Route to appropriate handler
        if method == "tools/list":
            return self.list_tools()
        elif method == "tools/call":
            return self.call_tool(yt, params)
        else:
            return {
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            }

    def list_tools(self) -> dict:
        """Return available tools"""
        return {
            "tools": [
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
        }

    def call_tool(self, yt: YTMusic, params: dict) -> dict:
        """Execute a tool with YTMusic instance"""
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        try:
            if tool_name == "search_music":
                results = yt.search(
                    arguments.get("query"),
                    filter=arguments.get("filter"),
                    limit=arguments.get("limit", 20)
                )
                return {"content": [{"type": "text", "text": json.dumps(results)}]}

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
                        "text": f"Added {len(arguments.get('video_ids', []))} songs to playlist"
                    }]
                }

            elif tool_name == "get_playlists":
                playlists = yt.get_library_playlists(
                    limit=arguments.get("limit", 25)
                )
                return {"content": [{"type": "text", "text": json.dumps(playlists)}]}

            else:
                return {
                    "error": {
                        "code": -32602,
                        "message": f"Unknown tool: {tool_name}"
                    }
                }

        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            return {
                "error": {
                    "code": -32603,
                    "message": str(e)
                }
            }
