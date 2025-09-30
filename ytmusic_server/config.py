"""
Server configuration with Smithery platform awareness.

Handles URL detection for proper OAuth metadata generation when running
on Smithery or other proxy platforms.
"""

import os
from typing import Optional
from urllib.parse import urljoin, urlparse
import structlog

logger = structlog.get_logger(__name__)


class ServerConfig:
    """Server configuration with platform awareness."""

    def __init__(self):
        self.logger = logger.bind(component="server_config")
        self._current_request = None
        self._cached_url = None
        self._last_request_headers_hash = None

    def set_request_context(self, request):
        """Set current request for URL detection."""
        self._current_request = request

    def _get_request_headers_hash(self) -> Optional[str]:
        """Generate a hash of relevant request headers for caching."""
        if not self._current_request:
            return None

        try:
            # Get headers that affect URL detection
            relevant_headers = [
                self._current_request.headers.get("x-forwarded-host", ""),
                self._current_request.headers.get("forwarded-host", ""),
                self._current_request.headers.get("host", ""),
                self._current_request.headers.get("x-forwarded-proto", ""),
                self._current_request.headers.get("forwarded-proto", ""),
                self._current_request.headers.get("x-forwarded-prefix", ""),
                self._current_request.headers.get("forwarded-prefix", ""),
            ]

            # Create a simple hash of the headers
            headers_str = "|".join(relevant_headers)
            return str(hash(headers_str))
        except Exception:
            return None

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
            if self._cached_url != url:
                self.logger.info("Using explicit PUBLIC_URL", url=url)
                self._cached_url = url
            return url

        # Check if we can use cached URL based on request headers
        current_headers_hash = self._get_request_headers_hash()
        if (
            self._cached_url
            and current_headers_hash
            and current_headers_hash == self._last_request_headers_hash
        ):
            return self._cached_url

        # 2. Request context detection (new approach)
        request_url = self._detect_from_request_context()
        if request_url:
            if self._cached_url != request_url:
                self.logger.info("Detected URL from request context", url=request_url)
            self._cached_url = request_url
            self._last_request_headers_hash = current_headers_hash
            return request_url

        # 3. Smithery platform detection
        smithery_url = self._detect_smithery_url()
        if smithery_url:
            if self._cached_url != smithery_url:
                self.logger.info("Detected Smithery platform", url=smithery_url)
            self._cached_url = smithery_url
            self._last_request_headers_hash = current_headers_hash
            return smithery_url

        # 4. Generic proxy detection
        proxy_url = self._detect_proxy_url()
        if proxy_url:
            if self._cached_url != proxy_url:
                self.logger.info("Detected proxy environment", url=proxy_url)
            self._cached_url = proxy_url
            self._last_request_headers_hash = current_headers_hash
            return proxy_url

        # 5. Local development fallback
        port = os.getenv("PORT", "8081")
        fallback_url = f"http://localhost:{port}"
        if self._cached_url != fallback_url:
            self.logger.info("Using local development URL", url=fallback_url)
        self._cached_url = fallback_url
        self._last_request_headers_hash = current_headers_hash
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
        server_name = os.getenv("SMITHERY_SERVER_NAME") or os.getenv(
            "SMITHERY_SERVICE_NAME"
        )

        if username and server_name:
            return f"https://server.smithery.ai/@{username}/{server_name}"

        # Check for Smithery domain in forwarded headers
        forwarded_host = os.getenv("HTTP_X_FORWARDED_HOST") or os.getenv(
            "X_FORWARDED_HOST"
        )
        if forwarded_host and "smithery.ai" in forwarded_host:
            forwarded_proto = os.getenv("HTTP_X_FORWARDED_PROTO", "https")
            forwarded_prefix = os.getenv("HTTP_X_FORWARDED_PREFIX", "")
            return f"{forwarded_proto}://{forwarded_host}{forwarded_prefix}"

        return ""

    def _detect_from_request_context(self) -> str:
        """
        Detect URL from current request context (headers).

        Returns:
            Request-based URL or empty string if not available
        """
        if not self._current_request:
            return ""

        try:
            # Check for forwarded headers first (proxy/reverse proxy setup)
            host = (
                self._current_request.headers.get("x-forwarded-host")
                or self._current_request.headers.get("forwarded-host")
                or self._current_request.headers.get("host")
            )

            if not host:
                return ""

            # Determine protocol
            proto = self._current_request.headers.get(
                "x-forwarded-proto"
            ) or self._current_request.headers.get("forwarded-proto")

            if not proto:
                # Default to https for non-localhost, http for localhost
                proto = (
                    "https"
                    if not host.startswith("localhost")
                    and not host.startswith("127.0.0.1")
                    else "http"
                )

            # Get path prefix if any
            prefix = (
                self._current_request.headers.get("x-forwarded-prefix")
                or self._current_request.headers.get("forwarded-prefix")
                or ""
            )

            url = f"{proto}://{host}{prefix}"

            # Special handling for Smithery - detect if this looks like a Smithery URL
            if "smithery.ai" in host.lower():
                # Only log if this is a new URL detection to prevent log spam
                if self._cached_url != url:
                    self.logger.info(
                        "Detected Smithery URL from request headers", url=url, host=host
                    )
                return url

            # For other proxy setups
            if any(
                header in self._current_request.headers
                for header in [
                    "x-forwarded-host",
                    "forwarded-host",
                    "x-forwarded-proto",
                ]
            ):
                # Only log if this is a new URL detection to prevent log spam
                if self._cached_url != url:
                    self.logger.info(
                        "Detected proxy URL from request headers", url=url, host=host
                    )
                return url

            return ""

        except Exception as e:
            self.logger.warning(
                "Failed to detect URL from request context", error=str(e)
            )
            return ""

    def _detect_proxy_url(self) -> str:
        """
        Detect generic reverse proxy environment.

        Returns:
            Proxy public URL or empty string if not detected
        """
        forwarded_host = os.getenv("HTTP_X_FORWARDED_HOST") or os.getenv(
            "X_FORWARDED_HOST"
        )
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
