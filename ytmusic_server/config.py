"""
Server configuration with Smithery platform awareness.

Handles URL detection for proper OAuth metadata generation when running
on Smithery or other proxy platforms.
"""

import os
from urllib.parse import urljoin, urlparse
import structlog

logger = structlog.get_logger(__name__)


class ServerConfig:
    """Server configuration with platform awareness."""

    def __init__(self):
        self.logger = logger.bind(component="server_config")

    @property
    def base_url(self) -> str:
        """
        Get the public-facing base URL for the server.

        Returns:
            The base URL that clients use to access the server
        """
        # 1. Explicit override (highest priority)
        if os.getenv("PUBLIC_URL"):
            url = os.getenv("PUBLIC_URL")
            self.logger.info("Using explicit PUBLIC_URL", url=url)
            return url

        # 2. Smithery platform detection
        smithery_url = self._detect_smithery_url()
        if smithery_url:
            self.logger.info("Detected Smithery platform", url=smithery_url)
            return smithery_url

        # 3. Generic proxy detection
        proxy_url = self._detect_proxy_url()
        if proxy_url:
            self.logger.info("Detected proxy environment", url=proxy_url)
            return proxy_url

        # 4. Local development fallback
        port = os.getenv("PORT", "8081")
        fallback_url = f"http://localhost:{port}"
        self.logger.info("Using local development URL", url=fallback_url)
        return fallback_url

    def _detect_smithery_url(self) -> str:
        """
        Detect if running on Smithery platform and construct public URL.

        Returns:
            Smithery public URL or empty string if not detected
        """
        # Check for Smithery-specific environment variables
        if os.getenv("SMITHERY_PUBLIC_URL"):
            return os.getenv("SMITHERY_PUBLIC_URL")

        # Construct from Smithery username and server name
        username = os.getenv("SMITHERY_USERNAME") or os.getenv("SMITHERY_USER")
        server_name = os.getenv("SMITHERY_SERVER_NAME") or os.getenv("SMITHERY_SERVICE_NAME")

        if username and server_name:
            return f"https://server.smithery.ai/@{username}/{server_name}"

        # Check for Smithery domain in forwarded headers
        forwarded_host = os.getenv("HTTP_X_FORWARDED_HOST") or os.getenv("X_FORWARDED_HOST")
        if forwarded_host and "smithery.ai" in forwarded_host:
            forwarded_proto = os.getenv("HTTP_X_FORWARDED_PROTO", "https")
            forwarded_prefix = os.getenv("HTTP_X_FORWARDED_PREFIX", "")
            return f"{forwarded_proto}://{forwarded_host}{forwarded_prefix}"

        return ""

    def _detect_proxy_url(self) -> str:
        """
        Detect generic reverse proxy environment.

        Returns:
            Proxy public URL or empty string if not detected
        """
        forwarded_host = os.getenv("HTTP_X_FORWARDED_HOST") or os.getenv("X_FORWARDED_HOST")
        if not forwarded_host:
            return ""

        forwarded_proto = os.getenv("HTTP_X_FORWARDED_PROTO", "https")
        forwarded_prefix = os.getenv("HTTP_X_FORWARDED_PREFIX", "")

        return f"{forwarded_proto}://{forwarded_host}{forwarded_prefix}"

    def get_endpoint_url(self, path: str) -> str:
        """
        Get full URL for an endpoint path.

        Args:
            path: Endpoint path (e.g., "/.well-known/oauth-protected-resource")

        Returns:
            Full URL to the endpoint
        """
        base = self.base_url
        if path.startswith("/"):
            return urljoin(base + "/", path[1:])
        else:
            return urljoin(base + "/", path)

    @property
    def oauth_config(self) -> dict:
        """
        Get OAuth-specific configuration.

        Returns:
            Dictionary with OAuth configuration
        """
        return {
            "issuer": self.base_url,
            "authorization_endpoint": self.get_endpoint_url("/oauth/authorize"),
            "token_endpoint": self.get_endpoint_url("/oauth/token"),
            "registration_endpoint": self.get_endpoint_url("/oauth/register"),
            "jwks_uri": self.get_endpoint_url("/.well-known/jwks.json"),
            "introspection_endpoint": self.get_endpoint_url("/oauth/introspect"),
            "revocation_endpoint": self.get_endpoint_url("/oauth/revoke"),
        }

    def get_redirect_uris(self) -> list:
        """
        Get allowed OAuth redirect URIs.

        Returns:
            List of allowed redirect URIs
        """
        uris = [
            # Smithery OAuth callback
            "https://smithery.ai/oauth/callback",
            "https://server.smithery.ai/oauth/callback",

            # Local development
            "http://localhost:3000/callback",
            "http://localhost:8080/auth/callback",
        ]

        # Add custom redirect URIs from environment
        custom_uris = os.getenv("OAUTH_REDIRECT_URIS", "").split(",")
        for uri in custom_uris:
            if uri.strip():
                uris.append(uri.strip())

        return uris

    def is_smithery_platform(self) -> bool:
        """Check if running on Smithery platform."""
        return "smithery.ai" in self.base_url.lower()

    def get_platform_info(self) -> dict:
        """Get information about the hosting platform."""
        base = self.base_url
        parsed = urlparse(base)

        info = {
            "base_url": base,
            "domain": parsed.netloc,
            "scheme": parsed.scheme,
            "path_prefix": parsed.path,
        }

        if self.is_smithery_platform():
            info["platform"] = "smithery"
            info["platform_version"] = os.getenv("SMITHERY_VERSION", "unknown")
        else:
            info["platform"] = "generic"

        return info


# Global configuration instance
config = ServerConfig()