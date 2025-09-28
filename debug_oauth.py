#!/usr/bin/env python3
"""
Debug OAuth flow for YouTube Music MCP Server
This helps identify issues with the OAuth authentication
"""

import os
import requests
import json
from urllib.parse import urlparse, parse_qs

def debug_oauth():
    print("=" * 60)
    print("YouTube Music MCP Server - OAuth Debug")
    print("=" * 60)

    # Check environment variables
    print("\n1. Checking OAuth Configuration...")
    print("-" * 40)

    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:8081/oauth/callback")

    if not client_id:
        print("❌ GOOGLE_CLIENT_ID is not set!")
        print("   You need to set: export GOOGLE_CLIENT_ID='your-client-id.apps.googleusercontent.com'")
    else:
        print(f"✅ GOOGLE_CLIENT_ID is set: {client_id[:20]}...")

    if not client_secret:
        print("❌ GOOGLE_CLIENT_SECRET is not set!")
        print("   You need to set: export GOOGLE_CLIENT_SECRET='your-secret'")
    else:
        print(f"✅ GOOGLE_CLIENT_SECRET is set: {'*' * 10}")

    print(f"ℹ️  OAUTH_REDIRECT_URI: {redirect_uri}")

    if not client_id or not client_secret:
        print("\n⚠️  Cannot proceed without OAuth credentials!")
        print("\nTo fix this:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. Create OAuth 2.0 credentials")
        print("3. Set environment variables before running the server:")
        print("   export GOOGLE_CLIENT_ID='your-client-id'")
        print("   export GOOGLE_CLIENT_SECRET='your-secret'")
        print("   export TRANSPORT=http PORT=8081")
        print("   python main.py")
        return False

    # Test OAuth endpoints
    print("\n2. Testing OAuth Endpoints...")
    print("-" * 40)

    base_url = "http://localhost:8081"

    # Test authorize endpoint
    print("\nTesting /oauth/authorize endpoint...")
    try:
        response = requests.get(f"{base_url}/oauth/authorize", timeout=5)
        if response.status_code == 200:
            # Check if it contains a proper Google OAuth URL
            if "accounts.google.com" in response.text and client_id in response.text:
                print("✅ OAuth authorize endpoint is working correctly")

                # Extract the auth URL
                import re
                match = re.search(r'href="(https://accounts\.google\.com[^"]+)"', response.text)
                if match:
                    auth_url = match.group(1)
                    parsed = urlparse(auth_url)
                    params = parse_qs(parsed.query)

                    print("\nOAuth URL Parameters:")
                    print(f"  Client ID: {params.get('client_id', ['Not found'])[0][:30]}...")
                    print(f"  Redirect URI: {params.get('redirect_uri', ['Not found'])[0]}")
                    print(f"  Scope: {params.get('scope', ['Not found'])[0]}")
                    print(f"  Response Type: {params.get('response_type', ['Not found'])[0]}")

                    if params.get('client_id', [''])[0] == client_id:
                        print("  ✅ Client ID matches environment variable")
                    else:
                        print("  ❌ Client ID doesn't match!")
            else:
                print("❌ OAuth page exists but doesn't contain valid Google OAuth URL")
                print("   This means credentials might not be set correctly")
        else:
            print(f"❌ OAuth endpoint returned status {response.status_code}")
    except requests.ConnectionError:
        print("❌ Cannot connect to server. Make sure it's running on port 8081")
        return False
    except Exception as e:
        print(f"❌ Error testing OAuth endpoint: {e}")
        return False

    # Test the actual OAuth flow
    print("\n3. OAuth Flow Summary...")
    print("-" * 40)
    print("The OAuth flow should work as follows:")
    print("1. User visits /oauth/authorize")
    print("2. Server redirects to Google with your Client ID")
    print("3. User authorizes the app in Google")
    print("4. Google redirects back to /oauth/callback with a code")
    print("5. Server exchanges code for access token")
    print("6. Server stores token for the session")

    print("\n✅ If credentials are set, the flow should work!")
    print("\nTo complete authentication:")
    print(f"1. Visit: {base_url}/oauth/authorize")
    print("2. Click 'Authorize with Google'")
    print("3. Sign in and approve permissions")
    print("4. You'll be redirected back and authenticated")

    return True

def test_with_credentials():
    """Test what happens when we try to use the server"""
    print("\n4. Testing Server Response...")
    print("-" * 40)

    base_url = "http://localhost:8081"

    # Initialize MCP session
    try:
        response = requests.post(
            f"{base_url}/mcp",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            json={
                "jsonrpc": "2.0",
                "method": "initialize",
                "params": {
                    "protocolVersion": "0.1.0",
                    "capabilities": {},
                    "clientInfo": {"name": "debug-test", "version": "1.0"}
                },
                "id": 1
            }
        )

        if response.status_code == 200:
            session_id = response.headers.get('mcp-session-id')
            print(f"✅ Got session ID: {session_id[:16]}...")

            # Try to search without auth (should fail with auth message)
            response = requests.post(
                f"{base_url}/mcp",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "mcp-session-id": session_id
                },
                json={
                    "jsonrpc": "2.0",
                    "method": "tools/call",
                    "params": {
                        "name": "search_music",
                        "arguments": {
                            "query": "test",
                            "session_id": session_id
                        }
                    },
                    "id": 2
                }
            )

            # Parse response
            for line in response.text.strip().split('\n'):
                if line.startswith('data: '):
                    data = json.loads(line[6:])
                    if 'result' in data:
                        content = data['result'].get('content', [])
                        if content:
                            result = json.loads(content[0].get('text', '{}'))
                            if 'error' in result and result['error'] == 'Not authenticated':
                                print("✅ Server correctly requires authentication")
                                print(f"   Message: {result.get('message', '')}")
                            else:
                                print(f"ℹ️  Server response: {result}")
    except Exception as e:
        print(f"❌ Error testing server: {e}")

if __name__ == "__main__":
    print("\nYouTube Music MCP Server - OAuth Debugger")
    print("This tool helps identify OAuth configuration issues\n")

    # First check if server is running
    try:
        response = requests.get("http://localhost:8081/oauth/authorize", timeout=2)
        server_running = True
    except:
        server_running = False

    if not server_running:
        print("❌ Server is not running on port 8081")
        print("\nPlease start the server first:")
        print("  export GOOGLE_CLIENT_ID='your-client-id'")
        print("  export GOOGLE_CLIENT_SECRET='your-secret'")
        print("  export TRANSPORT=http PORT=8081")
        print("  python main.py")
    else:
        if debug_oauth():
            test_with_credentials()

        print("\n" + "=" * 60)
        print("Debug complete!")
