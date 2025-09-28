"""
Security validators for input validation and security checks.
"""

import re
import secrets
import urllib.parse
from typing import Optional, List, Set, Dict, Any
from ipaddress import ip_address, AddressValueError
import structlog

logger = structlog.get_logger(__name__)


class SecurityValidationError(Exception):
    """Security validation error."""
    pass


class SecurityValidator:
    """
    Security validator for request validation and security checks.

    Features:
    - Input sanitization and validation
    - IP address validation and allowlisting
    - OAuth parameter validation
    - Rate limiting validation
    - URL validation for redirects
    """

    def __init__(
        self,
        allowed_ips: Optional[List[str]] = None,
        blocked_ips: Optional[List[str]] = None,
    ):
        self.allowed_ips: Set[str] = set(allowed_ips or [])
        self.blocked_ips: Set[str] = set(blocked_ips or [])
        self.logger = logger.bind(component="security_validator")

        self.logger.info(
            "Security validator initialized",
            allowed_ips_count=len(self.allowed_ips),
            blocked_ips_count=len(self.blocked_ips),
        )

    def validate_ip_address(self, ip_addr: str) -> bool:
        """
        Validate IP address against allowlist and blocklist.

        Args:
            ip_addr: IP address to validate

        Returns:
            True if IP is allowed

        Raises:
            SecurityValidationError: If IP is blocked or invalid
        """
        try:
            # Validate IP format
            ip_obj = ip_address(ip_addr)

            # Check if IP is blocked
            if self.blocked_ips and ip_addr in self.blocked_ips:
                self.logger.warning("Blocked IP address attempted access", ip=ip_addr)
                raise SecurityValidationError(f"IP address {ip_addr} is blocked")

            # Check allowlist if configured
            if self.allowed_ips and ip_addr not in self.allowed_ips:
                self.logger.warning("Non-allowlisted IP attempted access", ip=ip_addr)
                raise SecurityValidationError(f"IP address {ip_addr} is not allowed")

            self.logger.debug("IP address validated", ip=ip_addr)
            return True

        except AddressValueError:
            self.logger.error("Invalid IP address format", ip=ip_addr)
            raise SecurityValidationError(f"Invalid IP address format: {ip_addr}")

    def validate_oauth_state(self, state: str) -> bool:
        """
        Validate OAuth state parameter.

        Args:
            state: OAuth state parameter

        Returns:
            True if state is valid

        Raises:
            SecurityValidationError: If state is invalid
        """
        if not state:
            raise SecurityValidationError("OAuth state parameter is required")

        # Check length (minimum 32 characters for security)
        if len(state) < 32:
            raise SecurityValidationError("OAuth state parameter too short")

        # Check format (alphanumeric and safe characters)
        if not re.match(r'^[A-Za-z0-9_-]+$', state):
            raise SecurityValidationError("OAuth state contains invalid characters")

        self.logger.debug("OAuth state validated", state_length=len(state))
        return True

    def validate_oauth_code(self, code: str) -> bool:
        """
        Validate OAuth authorization code.

        Args:
            code: OAuth authorization code

        Returns:
            True if code is valid

        Raises:
            SecurityValidationError: If code is invalid
        """
        if not code:
            raise SecurityValidationError("OAuth authorization code is required")

        # Check minimum length
        if len(code) < 10:
            raise SecurityValidationError("OAuth authorization code too short")

        # Check format (allow alphanumeric, hyphens, underscores)
        if not re.match(r'^[A-Za-z0-9_-]+$', code):
            raise SecurityValidationError("OAuth authorization code contains invalid characters")

        self.logger.debug("OAuth authorization code validated", code_length=len(code))
        return True

    def validate_pkce_verifier(self, code_verifier: str) -> bool:
        """
        Validate PKCE code verifier.

        Args:
            code_verifier: PKCE code verifier

        Returns:
            True if verifier is valid

        Raises:
            SecurityValidationError: If verifier is invalid
        """
        if not code_verifier:
            raise SecurityValidationError("PKCE code verifier is required")

        # RFC 7636: 43-128 characters
        if not (43 <= len(code_verifier) <= 128):
            raise SecurityValidationError("PKCE code verifier length must be 43-128 characters")

        # RFC 7636: unreserved characters
        if not re.match(r'^[A-Za-z0-9_\-\.~]+$', code_verifier):
            raise SecurityValidationError("PKCE code verifier contains invalid characters")

        self.logger.debug("PKCE code verifier validated", verifier_length=len(code_verifier))
        return True

    def validate_redirect_uri(self, redirect_uri: str, allowed_domains: List[str]) -> bool:
        """
        Validate OAuth redirect URI.

        Args:
            redirect_uri: Redirect URI to validate
            allowed_domains: List of allowed domains

        Returns:
            True if URI is valid

        Raises:
            SecurityValidationError: If URI is invalid
        """
        if not redirect_uri:
            raise SecurityValidationError("Redirect URI is required")

        try:
            parsed = urllib.parse.urlparse(redirect_uri)

            # Must use HTTPS in production
            if parsed.scheme not in ['https', 'http']:
                raise SecurityValidationError("Redirect URI must use HTTPS or HTTP")

            # Validate domain
            if allowed_domains and parsed.netloc not in allowed_domains:
                self.logger.warning(
                    "Redirect URI with non-allowed domain",
                    uri=redirect_uri,
                    domain=parsed.netloc,
                )
                raise SecurityValidationError(f"Domain {parsed.netloc} is not allowed")

            self.logger.debug("Redirect URI validated", uri=redirect_uri)
            return True

        except ValueError as e:
            raise SecurityValidationError(f"Invalid redirect URI format: {e}")

    def validate_session_id(self, session_id: str) -> bool:
        """
        Validate session ID format.

        Args:
            session_id: Session identifier

        Returns:
            True if session ID is valid

        Raises:
            SecurityValidationError: If session ID is invalid
        """
        if not session_id:
            raise SecurityValidationError("Session ID is required")

        # Check format (URL-safe base64 token, 32 bytes = 43 chars)
        if not re.match(r'^[A-Za-z0-9_-]{43}$', session_id):
            raise SecurityValidationError("Invalid session ID format")

        self.logger.debug("Session ID validated", session_id=session_id[:8] + "...")
        return True

    def validate_user_agent(self, user_agent: Optional[str]) -> bool:
        """
        Validate user agent string.

        Args:
            user_agent: User agent string

        Returns:
            True if user agent is valid
        """
        if not user_agent:
            return True  # User agent is optional

        # Check length
        if len(user_agent) > 500:
            raise SecurityValidationError("User agent string too long")

        # Basic format check (printable ASCII)
        if not all(32 <= ord(c) <= 126 for c in user_agent):
            raise SecurityValidationError("User agent contains invalid characters")

        self.logger.debug("User agent validated", user_agent_length=len(user_agent))
        return True

    def sanitize_input(self, input_str: str, max_length: int = 1000) -> str:
        """
        Sanitize user input by removing dangerous characters.

        Args:
            input_str: Input string to sanitize
            max_length: Maximum allowed length

        Returns:
            Sanitized string
        """
        if not input_str:
            return ""

        # Truncate if too long
        if len(input_str) > max_length:
            input_str = input_str[:max_length]

        # Remove control characters and normalize
        sanitized = ''.join(c for c in input_str if c.isprintable())

        return sanitized.strip()

    @staticmethod
    def generate_secure_token(length: int = 32) -> str:
        """
        Generate cryptographically secure random token.

        Args:
            length: Token length in bytes

        Returns:
            URL-safe base64 encoded token
        """
        return secrets.token_urlsafe(length)

    def validate_request_size(self, content_length: Optional[int], max_size: int = 1024 * 1024) -> bool:
        """
        Validate request content size.

        Args:
            content_length: Request content length
            max_size: Maximum allowed size in bytes

        Returns:
            True if size is valid

        Raises:
            SecurityValidationError: If request is too large
        """
        if content_length is None:
            return True

        if content_length > max_size:
            self.logger.warning(
                "Request too large",
                content_length=content_length,
                max_size=max_size,
            )
            raise SecurityValidationError(f"Request size {content_length} exceeds limit {max_size}")

        return True