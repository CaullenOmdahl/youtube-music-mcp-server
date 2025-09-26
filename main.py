"""
YouTube Music MCP Server with HTTP Transport

A Python MCP server for YouTube Music operations with HTTP transport support.
Handles session configuration passed via query parameters.
"""

import os
import uvicorn
from starlette.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any
import contextvars

# Import our existing server
from ytmusic_server.server import create_server
from middleware import SmitheryConfigMiddleware

def get_request_config() -> dict:
    """Get full config from current request context."""
    try:
        # Access the current request context
        import contextvars

        # Try to get from request context if available
        request = contextvars.copy_context().get('request')
        if hasattr(request, 'scope') and request.scope:
            return request.scope.get('smithery_config', {})
    except:
        pass

    # Return empty dict if no config found
    return {}

def get_config_value(key: str, default=None):
    """Get a specific config value from current request."""
    config = get_request_config()
    if config is None:
        config = {}
    return config.get(key, default)

def main():
    """Main entry point for the server."""
    transport_mode = os.getenv("TRANSPORT", "http")

    if transport_mode == "http":
        print("YouTube Music MCP Server starting in HTTP mode...")

        # Use smithery.cli.dev for HTTP mode since SmitheryFastMCP handles the HTTP transport
        # We cannot directly use uvicorn with SmitheryFastMCP
        import subprocess
        import sys

        port = int(os.environ.get("PORT", 8081))
        print(f"Starting server on port {port}")

        # Run the smithery dev server which handles HTTP transport properly
        subprocess.run([
            sys.executable, "-m", "smithery.cli.dev",
            "--port", str(port),
            "--host", "0.0.0.0"
        ])

    else:
        # Fallback to stdio mode for local development
        print("YouTube Music MCP Server starting in stdio mode...")
        mcp_server = create_server()
        mcp_server.run()

if __name__ == "__main__":
    main()
