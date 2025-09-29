"""
OAuth 2.0 middleware for MCP server.

Implements transport-level OAuth authentication with proper WWW-Authenticate
headers and token validation.
"""

import os
import re
from typing import Optional, Dict, Any
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
import structlog

from ..config import config

logger = structlog.get_logger(__name__)


class OAuthMiddleware(BaseHTTPMiddleware):
    """OAuth 2.0 authentication middleware for MCP transport."""

    def __init__(self, app):
        super().__init__(app)
        self.logger = logger.bind(component="oauth_middleware")

        # Allow bypass for testing
        self.bypass_auth = os.getenv("BYPASS_AUTH_FOR_TESTING", "false").lower() == "true"
        if self.bypass_auth:
            self.logger.warning("OAuth bypass enabled for testing - DO NOT USE IN PRODUCTION")

        # Log platform configuration
        platform_info = config.get_platform_info()
        self.logger.info("OAuth middleware initialized", **platform_info)

        # Paths that don't require authentication
        self.public_paths = {
            "/.well-known/oauth-protected-resource",
            "/.well-known/oauth-authorization-server",
            "/.well-known/jwks.json",
            "/health",
            "/oauth/authorize",
            "/oauth/token",
            "/oauth/register",
            "/oauth/introspect",
            "/oauth/revoke"
        }

    async def dispatch(self, request: Request, call_next):
        """Process OAuth authentication for requests."""

        # Set request context for URL detection
        config.set_request_context(request)

        # Skip authentication for public endpoints
        if request.url.path in self.public_paths:
            return await call_next(request)

        # Bypass auth for testing if enabled
        if self.bypass_auth and request.client.host in ["127.0.0.1", "::1"]:
            self.logger.info("Bypassing OAuth for local testing", client_host=request.client.host)
            # Set mock token info for tools
            request.state.oauth_token = {
                "sub": "test-user",
                "scope": "mcp:tools youtube:readonly",
                "exp": 9999999999,
                "iss": config.base_url,
                "aud": config.base_url
            }
            request.state.user_id = "test-user"
            request.state.scopes = ["mcp:tools", "youtube:readonly"]
            return await call_next(request)

        # Extract and validate bearer token
        auth_header = request.headers.get("authorization", "")
        token = self._extract_bearer_token(auth_header)

        if not token:
            return self._unauthorized_response("missing_token")

        # Validate token
        token_info = await self._validate_token(token)
        if not token_info:
            return self._unauthorized_response("invalid_token")

        # Add token info to request state for tools to access
        request.state.oauth_token = token_info
        request.state.user_id = token_info.get("sub")
        request.state.scopes = token_info.get("scope", "").split()

        return await call_next(request)

    def _extract_bearer_token(self, auth_header: str) -> Optional[str]:
        """Extract bearer token from Authorization header."""
        if not auth_header:
            return None

        match = re.match(r"Bearer\s+(.+)", auth_header, re.IGNORECASE)
        return match.group(1) if match else None

    async def _validate_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate OAuth access token.

        For now, this is a placeholder. In a real implementation:
        1. Validate JWT signature
        2. Check expiration
        3. Verify audience and issuer
        4. Check scopes
        """
        try:
            # TODO: Implement proper JWT validation
            # For development, accept any token starting with "mcp_"
            if token.startswith("mcp_"):
                return {
                    "sub": "user123",
                    "scope": "mcp:tools youtube:readonly",
                    "exp": 9999999999,  # Far future
                    "iss": self.auth_server_url,
                    "aud": self.server_url
                }

            return None

        except Exception as e:
            self.logger.warning("Token validation failed", error=str(e))
            return None

    def _unauthorized_response(self, error: str) -> Response:
        """Return 401 response with WWW-Authenticate header."""

        resource_metadata_url = config.get_endpoint_url("/.well-known/oauth-protected-resource")

        www_authenticate = (
            f'Bearer realm="youtube-music", '
            f'resource_metadata="{resource_metadata_url}", '
            f'error="{error}"'
        )

        self.logger.info(
            "Returning 401 unauthorized",
            error=error,
            auth_header=www_authenticate,
            resource_metadata_url=resource_metadata_url
        )

        return JSONResponse(
            status_code=401,
            content={
                "error": "unauthorized",
                "error_description": f"Authentication required: {error}",
                "resource_metadata_url": resource_metadata_url
            },
            headers={
                "WWW-Authenticate": www_authenticate,
                "Content-Type": "application/json"
            }
        )