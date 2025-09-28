"""
YouTube Music MCP Server

Enterprise-grade Model Context Protocol server for YouTube Music integration
with OAuth 2.1 authentication, comprehensive security, and production-ready features.

Copyright (c) 2024 YouTube Music MCP Team
Licensed under the MIT License
"""

__version__ = "2.0.0"
__author__ = "YouTube Music MCP Team"
__email__ = "contact@example.com"

# Server implementation
from .server import create_server, YouTubeMusicMCPServer
__all__ = ["create_server", "YouTubeMusicMCPServer"]