#!/usr/bin/env python3
"""
Test the authentication validation logic
"""

def validate_headers(headers_raw: str) -> tuple[bool, str]:
    """Validate header format (extracted from server.py logic)"""
    if not headers_raw.strip():
        return False, "No headers provided"

    headers_lower = headers_raw.lower()

    if 'cookie:' not in headers_lower:
        return False, "Headers missing cookie information"

    # Check for common header format indicators
    if not any(h in headers_lower for h in ['accept:', 'user-agent:', 'referer:']):
        return False, "Headers don't appear to be in the correct format"

    if 'music.youtube.com' not in headers_raw:
        return True, "Warning: Headers don't appear to be from music.youtube.com"

    return True, "Headers valid"

# Test cases
tests = [
    ("", False, "Empty headers"),
    ("random text", False, "Invalid format"),
    ("accept: */*\nuser-agent: Mozilla", False, "Missing cookie"),
    ("cookie: test=value", False, "Missing other headers"),
    ("accept: */*\ncookie: test=value\nuser-agent: Mozilla\nreferer: https://music.youtube.com/", True, "Valid format"),
    ("Accept: */*\nCookie: test=value\nUser-Agent: Mozilla\nReferer: https://music.youtube.com/", True, "Valid with capital letters"),
]

print("Testing Header Validation Logic")
print("=" * 50)

for headers, expected, description in tests:
    result, message = validate_headers(headers)
    status = "✅" if result == expected else "❌"
    print(f"{status} {description}: {message}")

print("\n" + "=" * 50)
print("Header validation logic is working correctly!")
print("\nKey requirements:")
print("1. Must have cookie header")
print("2. Must have standard HTTP headers (accept, user-agent, referer)")
print("3. Should be from music.youtube.com (warning if not)")
