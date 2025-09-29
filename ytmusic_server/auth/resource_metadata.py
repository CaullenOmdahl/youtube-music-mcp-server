"""
RFC 9728 Protected Resource Metadata implementation.

Provides OAuth 2.0 Protected Resource Metadata for MCP clients to discover
authorization servers and required scopes.
"""

import os
from typing import Dict, List, Any
from pydantic import BaseModel, AnyHttpUrl
import structlog

logger = structlog.get_logger(__name__)


class ProtectedResourceMetadata(BaseModel):
    """OAuth 2.0 Protected Resource Metadata (RFC 9728)."""

    resource: AnyHttpUrl
    authorization_servers: List[AnyHttpUrl]
    scopes_supported: List[str]
    bearer_methods_supported: List[str] = ["header"]
    resource_documentation: str = "https://github.com/CaullenOmdahl/youtube-music-mcp-server"


class ResourceMetadataHandler:
    """Handles Protected Resource Metadata discovery."""

    def __init__(self, server_url: str, auth_server_url: str = None):
        self.server_url = server_url
        self.auth_server_url = auth_server_url or f"{server_url}/oauth"
        self.logger = logger.bind(component="resource_metadata")

    def get_metadata(self) -> Dict[str, Any]:
        """
        Get RFC 9728 Protected Resource Metadata.

        Returns:
            Protected Resource Metadata as dict
        """
        metadata = ProtectedResourceMetadata(
            resource=self.server_url,
            authorization_servers=[self.auth_server_url],
            scopes_supported=[
                "mcp:tools",
                "youtube:readonly",
                "youtube:manage_playlists"
            ]
        )

        self.logger.info(
            "Generated protected resource metadata",
            resource=self.server_url,
            auth_servers=len(metadata.authorization_servers)
        )

        return metadata.model_dump(mode='json')

    def get_authorization_server_metadata(self) -> Dict[str, Any]:
        """
        Get OAuth Authorization Server Metadata.

        Returns:
            Authorization Server Metadata as dict
        """
        metadata = {
            "issuer": self.auth_server_url,
            "authorization_endpoint": f"{self.auth_server_url}/authorize",
            "token_endpoint": f"{self.auth_server_url}/token",
            "jwks_uri": f"{self.auth_server_url}/.well-known/jwks.json",
            "registration_endpoint": f"{self.auth_server_url}/register",
            "scopes_supported": [
                "mcp:tools",
                "youtube:readonly",
                "youtube:manage_playlists"
            ],
            "response_types_supported": ["code"],
            "grant_types_supported": [
                "authorization_code",
                "refresh_token"
            ],
            "token_endpoint_auth_methods_supported": [
                "client_secret_post",
                "client_secret_basic"
            ],
            "code_challenge_methods_supported": ["S256"],
            "introspection_endpoint": f"{self.auth_server_url}/introspect",
            "revocation_endpoint": f"{self.auth_server_url}/revoke"
        }

        self.logger.info(
            "Generated authorization server metadata",
            issuer=self.auth_server_url
        )

        return metadata