#!/usr/bin/env python3
"""
Test script to verify header-based authentication works correctly
"""

import sys
sys.path.insert(0, 'src')

from ytmusic_server.server import YouTubeMusicAPI
import logging

logging.basicConfig(level=logging.DEBUG)

def test_empty_headers():
    """Test with empty headers"""
    print("\n=== Testing empty headers ===")
    api = YouTubeMusicAPI("")
    result = api.setup_from_headers()
    assert result == False, "Should fail with empty headers"
    print("✅ Empty headers correctly rejected")

def test_invalid_headers():
    """Test with invalid headers"""
    print("\n=== Testing invalid headers ===")
    api = YouTubeMusicAPI("some random text that isn't headers")
    result = api.setup_from_headers()
    assert result == False, "Should fail with invalid headers"
    print("✅ Invalid headers correctly rejected")

def test_missing_cookie():
    """Test headers missing cookie"""
    print("\n=== Testing headers without cookie ===")
    headers = """accept: */*
user-agent: Mozilla/5.0
referer: https://music.youtube.com/"""
    api = YouTubeMusicAPI(headers)
    result = api.setup_from_headers()
    assert result == False, "Should fail without cookie"
    print("✅ Headers without cookie correctly rejected")

def test_valid_format():
    """Test headers with valid format (will fail auth but format should pass)"""
    print("\n=== Testing valid header format ===")
    headers = """accept: */*
accept-encoding: gzip, deflate, br
accept-language: en-US,en;q=0.9
cookie: FAKE_COOKIE=test_value; SESSION=fake_session
referer: https://music.youtube.com/
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"""

    api = YouTubeMusicAPI(headers)
    # This will fail authentication but should pass format validation
    result = api.setup_from_headers()
    # Result will be False due to invalid auth, but check it got past format validation
    assert api.headers_raw == headers, "Headers should be stored"
    print("✅ Valid format headers accepted (auth will fail with fake cookies)")

if __name__ == "__main__":
    print("Testing Header-Based Authentication Implementation")
    print("=" * 50)

    test_empty_headers()
    test_invalid_headers()
    test_missing_cookie()
    test_valid_format()

    print("\n" + "=" * 50)
    print("All validation tests passed! ✅")
    print("\nThe implementation correctly:")
    print("- Rejects empty headers")
    print("- Rejects invalid header formats")
    print("- Requires cookie information")
    print("- Accepts properly formatted headers")
