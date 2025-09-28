"""
YouTube Music API integration with OAuth and rate limiting.
"""

from .client import YTMusicClient, YTMusicError
from .rate_limiter import RateLimiter, RateLimitExceeded

__all__ = [
    "YTMusicClient",
    "YTMusicError",
    "RateLimiter",
    "RateLimitExceeded",
]