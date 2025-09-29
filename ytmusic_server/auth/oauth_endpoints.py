"""
OAuth 2.0 endpoints for MCP server.

Implements authorization server endpoints for RFC 6749 and RFC 9728 compliance.
"""

import os
import secrets
import time
from typing import Dict, Any, Optional
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse, HTMLResponse, Response
from starlette.routing import Route
import structlog

from .resource_metadata import ResourceMetadataHandler

logger = structlog.get_logger(__name__)


class OAuthEndpoints:
    """OAuth 2.0 authorization server endpoints."""

    def __init__(self, server_url: str, youtube_oauth_config: Dict[str, str]):
        self.server_url = server_url
        self.auth_server_url = f"{server_url}/oauth"
        self.youtube_config = youtube_oauth_config
        self.metadata_handler = ResourceMetadataHandler(server_url, self.auth_server_url)
        self.logger = logger.bind(component="oauth_endpoints")

        # In-memory storage for development (use Redis/DB in production)
        self.clients = {}
        self.authorization_codes = {}
        self.access_tokens = {}

    async def protected_resource_metadata(self, request: Request) -> JSONResponse:
        """RFC 9728 Protected Resource Metadata endpoint."""
        metadata = self.metadata_handler.get_metadata()
        return JSONResponse(metadata)

    async def authorization_server_metadata(self, request: Request) -> JSONResponse:
        """OAuth Authorization Server Metadata endpoint."""
        metadata = self.metadata_handler.get_authorization_server_metadata()
        return JSONResponse(metadata)

    async def jwks(self, request: Request) -> JSONResponse:
        """JSON Web Key Set endpoint."""
        # TODO: Implement proper JWKS with signing keys
        jwks = {
            "keys": []
        }
        return JSONResponse(jwks)

    async def register_client(self, request: Request) -> JSONResponse:
        """Dynamic client registration (RFC 7591)."""
        try:
            client_metadata = await request.json()

            # Generate client credentials
            client_id = f"mcp_{secrets.token_urlsafe(16)}"
            client_secret = secrets.token_urlsafe(32)

            # Store client
            self.clients[client_id] = {
                "client_id": client_id,
                "client_secret": client_secret,
                "client_name": client_metadata.get("client_name", "Unknown MCP Client"),
                "redirect_uris": client_metadata.get("redirect_uris", []),
                "grant_types": client_metadata.get("grant_types", ["authorization_code"]),
                "response_types": client_metadata.get("response_types", ["code"]),
                "scope": client_metadata.get("scope", "mcp:tools"),
                "created_at": time.time()
            }

            self.logger.info(
                "Registered new OAuth client",
                client_id=client_id,
                client_name=client_metadata.get("client_name")
            )

            return JSONResponse({
                "client_id": client_id,
                "client_secret": client_secret,
                "client_id_issued_at": int(time.time()),
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "client_secret_post"
            })

        except Exception as e:
            self.logger.error("Client registration failed", error=str(e))
            return JSONResponse(
                {"error": "invalid_client_metadata", "error_description": str(e)},
                status_code=400
            )

    async def authorize(self, request: Request) -> Response:
        """Authorization endpoint for OAuth flow."""
        try:
            # Extract authorization request parameters
            client_id = request.query_params.get("client_id")
            redirect_uri = request.query_params.get("redirect_uri")
            response_type = request.query_params.get("response_type")
            scope = request.query_params.get("scope", "mcp:tools")
            state = request.query_params.get("state")
            code_challenge = request.query_params.get("code_challenge")
            code_challenge_method = request.query_params.get("code_challenge_method")

            # Validate request
            if not client_id or client_id not in self.clients:
                return self._error_response("invalid_client", redirect_uri, state)

            if response_type != "code":
                return self._error_response("unsupported_response_type", redirect_uri, state)

            if not code_challenge or code_challenge_method != "S256":
                return self._error_response("invalid_request", redirect_uri, state)

            # For development, auto-approve (in production, show consent UI)
            authorization_code = f"code_{secrets.token_urlsafe(32)}"

            # Store authorization code
            self.authorization_codes[authorization_code] = {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "scope": scope,
                "code_challenge": code_challenge,
                "user_id": "user123",  # In production, get from authenticated session
                "expires_at": time.time() + 600,  # 10 minutes
                "used": False
            }

            # Redirect back to client with authorization code
            callback_url = f"{redirect_uri}?code={authorization_code}"
            if state:
                callback_url += f"&state={state}"

            self.logger.info(
                "Issued authorization code",
                client_id=client_id,
                code=authorization_code[:8] + "..."
            )

            return RedirectResponse(callback_url)

        except Exception as e:
            self.logger.error("Authorization failed", error=str(e))
            return self._error_response("server_error", redirect_uri, state)

    async def token(self, request: Request) -> JSONResponse:
        """Token endpoint for code exchange."""
        try:
            form = await request.form()

            grant_type = form.get("grant_type")
            if grant_type != "authorization_code":
                return JSONResponse(
                    {"error": "unsupported_grant_type"},
                    status_code=400
                )

            code = form.get("code")
            client_id = form.get("client_id")
            client_secret = form.get("client_secret")
            redirect_uri = form.get("redirect_uri")
            code_verifier = form.get("code_verifier")

            # Validate client
            if not client_id or client_id not in self.clients:
                return JSONResponse({"error": "invalid_client"}, status_code=401)

            client = self.clients[client_id]
            if client["client_secret"] != client_secret:
                return JSONResponse({"error": "invalid_client"}, status_code=401)

            # Validate authorization code
            if not code or code not in self.authorization_codes:
                return JSONResponse({"error": "invalid_grant"}, status_code=400)

            code_data = self.authorization_codes[code]

            if code_data["used"] or time.time() > code_data["expires_at"]:
                return JSONResponse({"error": "invalid_grant"}, status_code=400)

            if code_data["client_id"] != client_id:
                return JSONResponse({"error": "invalid_grant"}, status_code=400)

            # TODO: Validate PKCE code_verifier against stored code_challenge

            # Mark code as used
            code_data["used"] = True

            # Generate tokens
            access_token = f"mcp_{secrets.token_urlsafe(32)}"
            refresh_token = f"refresh_{secrets.token_urlsafe(32)}"

            # Store access token
            self.access_tokens[access_token] = {
                "client_id": client_id,
                "user_id": code_data["user_id"],
                "scope": code_data["scope"],
                "expires_at": time.time() + 3600,  # 1 hour
                "refresh_token": refresh_token
            }

            self.logger.info(
                "Issued access token",
                client_id=client_id,
                user_id=code_data["user_id"],
                scope=code_data["scope"]
            )

            return JSONResponse({
                "access_token": access_token,
                "token_type": "Bearer",
                "expires_in": 3600,
                "refresh_token": refresh_token,
                "scope": code_data["scope"]
            })

        except Exception as e:
            self.logger.error("Token exchange failed", error=str(e))
            return JSONResponse(
                {"error": "server_error", "error_description": str(e)},
                status_code=500
            )

    def _error_response(self, error: str, redirect_uri: str = None, state: str = None):
        """Generate OAuth error response."""
        if redirect_uri:
            error_url = f"{redirect_uri}?error={error}"
            if state:
                error_url += f"&state={state}"
            return RedirectResponse(error_url)
        else:
            return JSONResponse({"error": error}, status_code=400)

    def get_routes(self) -> list:
        """Get Starlette routes for OAuth endpoints."""
        return [
            Route("/.well-known/oauth-protected-resource",
                  self.protected_resource_metadata, methods=["GET"]),
            Route("/.well-known/oauth-authorization-server",
                  self.authorization_server_metadata, methods=["GET"]),
            Route("/.well-known/jwks.json",
                  self.jwks, methods=["GET"]),
            Route("/oauth/register",
                  self.register_client, methods=["POST"]),
            Route("/oauth/authorize",
                  self.authorize, methods=["GET"]),
            Route("/oauth/token",
                  self.token, methods=["POST"]),
        ]