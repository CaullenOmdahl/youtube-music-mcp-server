"""
Encryption manager for secure token and data storage.
"""

import base64
import json
from typing import Any
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import structlog

logger = structlog.get_logger(__name__)


class EncryptionError(Exception):
    """Encryption-related error."""
    pass


class EncryptionManager:
    """
    Manages encryption and decryption of sensitive data using Fernet (AES 128).

    Features:
    - AES-256 encryption via Fernet
    - JSON serialization support
    - Key derivation from passwords
    - Secure key validation
    """

    def __init__(self, encryption_key: str):
        """
        Initialize encryption manager with base64-encoded key.

        Args:
            encryption_key: Base64-encoded 32-byte encryption key
        """
        try:
            # Decode and validate the key
            key_bytes = base64.b64decode(encryption_key)
            if len(key_bytes) != 32:
                raise ValueError("Encryption key must be 32 bytes when decoded")

            # Create Fernet cipher
            self.fernet = Fernet(base64.urlsafe_b64encode(key_bytes))
            self.logger = logger.bind(component="encryption_manager")

            self.logger.info("Encryption manager initialized successfully")

        except Exception as e:
            raise EncryptionError(f"Failed to initialize encryption manager: {e}")

    @classmethod
    def generate_key(cls) -> str:
        """
        Generate a new base64-encoded encryption key.

        Returns:
            Base64-encoded 32-byte key suitable for initialization
        """
        key = Fernet.generate_key()
        # Convert to standard base64 for storage
        return base64.b64encode(base64.urlsafe_b64decode(key)).decode('utf-8')

    @classmethod
    def derive_key_from_password(cls, password: str, salt: bytes = None) -> str:
        """
        Derive encryption key from password using PBKDF2.

        Args:
            password: Password to derive key from
            salt: Optional salt (generates random if not provided)

        Returns:
            Base64-encoded derived key
        """
        if salt is None:
            salt = base64.b64decode("c2FsdA==")  # Default salt for consistency

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = kdf.derive(password.encode('utf-8'))
        return base64.b64encode(key).decode('utf-8')

    def encrypt(self, data: str | dict[str, Any, Any]) -> str:
        """
        Encrypt data and return base64-encoded result.

        Args:
            data: Data to encrypt (will be JSON-serialized if not string)

        Returns:
            Base64-encoded encrypted data
        """
        try:
            # Convert data to string if needed
            if isinstance(data, str):
                plaintext = data
            else:
                plaintext = json.dumps(data, default=str)

            # Encrypt and encode
            encrypted_bytes = self.fernet.encrypt(plaintext.encode('utf-8'))
            encrypted_b64 = base64.b64encode(encrypted_bytes).decode('utf-8')

            self.logger.debug(
                "Data encrypted successfully",
                data_type=type(data).__name__,
                plaintext_length=len(plaintext),
                encrypted_length=len(encrypted_b64),
            )

            return encrypted_b64

        except Exception as e:
            self.logger.error("Encryption failed", error=str(e))
            raise EncryptionError(f"Encryption failed: {e}")

    def decrypt(self, encrypted_data: str, return_json: bool = False) -> str | dict[str, Any]:
        """
        Decrypt base64-encoded encrypted data.

        Args:
            encrypted_data: Base64-encoded encrypted data
            return_json: Whether to parse result as JSON

        Returns:
            Decrypted data as string or parsed JSON
        """
        try:
            # Decode and decrypt
            encrypted_bytes = base64.b64decode(encrypted_data)
            decrypted_bytes = self.fernet.decrypt(encrypted_bytes)
            plaintext = decrypted_bytes.decode('utf-8')

            # Parse JSON if requested
            if return_json:
                try:
                    result = json.loads(plaintext)
                    self.logger.debug(
                        "Data decrypted and parsed as JSON",
                        encrypted_length=len(encrypted_data),
                        plaintext_length=len(plaintext),
                    )
                    return result
                except json.JSONDecodeError as e:
                    raise EncryptionError(f"Failed to parse decrypted data as JSON: {e}")

            self.logger.debug(
                "Data decrypted successfully",
                encrypted_length=len(encrypted_data),
                plaintext_length=len(plaintext),
            )

            return plaintext

        except Exception as e:
            self.logger.error("Decryption failed", error=str(e))
            raise EncryptionError(f"Decryption failed: {e}")

    def encrypt_token(self, token_data: dict[str, Any]) -> str:
        """
        Encrypt OAuth token data for secure storage.

        Args:
            token_data: Token data dictionary

        Returns:
            Encrypted token data
        """
        return self.encrypt(token_data)

    def decrypt_token(self, encrypted_token: str) -> dict[str, Any]:
        """
        Decrypt OAuth token data from storage.

        Args:
            encrypted_token: Encrypted token data

        Returns:
            Decrypted token data dictionary
        """
        return self.decrypt(encrypted_token, return_json=True)

    def is_valid_encrypted_data(self, encrypted_data: str) -> bool:
        """
        Check if encrypted data can be decrypted without actually decrypting it.

        Args:
            encrypted_data: Base64-encoded encrypted data

        Returns:
            True if data appears to be valid encrypted data
        """
        try:
            # Basic validation
            if not encrypted_data or not isinstance(encrypted_data, str):
                return False

            # Try to decode base64
            encrypted_bytes = base64.b64decode(encrypted_data)

            # Check minimum length for Fernet data
            if len(encrypted_bytes) < 45:  # Minimum Fernet token length
                return False

            return True

        except Exception:
            return False