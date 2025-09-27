#!/usr/bin/env python3
"""
OAuth Setup Script for YouTube Music MCP Server

This script handles the OAuth authentication flow for YouTube Music.
It uses the oauth.json file containing client credentials to authenticate
and generate a browser.json file with refresh tokens.
"""

import json
import os
import sys
from pathlib import Path
from ytmusicapi import YTMusic

def setup_oauth():
    """Run the OAuth setup flow"""

    # Check if oauth.json exists
    oauth_file = Path("oauth.json")
    if not oauth_file.exists():
        print("❌ oauth.json file not found!")
        print("Please ensure oauth.json is in the current directory.")
        print("It should contain your YouTube Data API OAuth client credentials.")
        return False

    # Check if browser.json already exists
    browser_file = Path("browser.json")
    if browser_file.exists():
        print("⚠️  browser.json already exists.")
        response = input("Do you want to re-authenticate? (y/N): ").strip().lower()
        if response != 'y':
            print("Keeping existing authentication.")
            return True

    print("🔐 Starting OAuth authentication flow...")
    print("=" * 60)

    try:
        # Read the oauth.json file
        with open(oauth_file, 'r') as f:
            oauth_data = json.load(f)

        # Extract client credentials
        if 'installed' in oauth_data:
            client_id = oauth_data['installed']['client_id']
            client_secret = oauth_data['installed']['client_secret']
        else:
            print("❌ Invalid oauth.json format. Expected 'installed' section.")
            return False

        print(f"Client ID: {client_id[:20]}...")
        print(f"Client Secret: {client_secret[:10]}...")
        print()

        # Run the OAuth flow
        print("📱 Running OAuth flow...")
        print("You will be prompted to visit a URL and enter a code.")
        print()

        # Use ytmusicapi's oauth command
        os.system("ytmusicapi oauth")

        # Check if browser.json was created
        if browser_file.exists():
            print()
            print("✅ OAuth setup completed successfully!")
            print("Authentication tokens saved to browser.json")

            # Test the authentication
            print()
            print("Testing authentication...")
            try:
                yt = YTMusic("browser.json")
                results = yt.search("test", limit=1)
                if results:
                    print("✅ Authentication working! Can perform searches.")

                    # Try to get playlists
                    try:
                        playlists = yt.get_library_playlists(limit=1)
                        print("✅ Library access confirmed.")
                    except:
                        print("⚠️  Library access may be limited.")

                return True
            except Exception as e:
                print(f"⚠️  Authentication test failed: {e}")
                return False
        else:
            print("❌ OAuth flow did not complete. browser.json not created.")
            return False

    except Exception as e:
        print(f"❌ Error during OAuth setup: {e}")
        return False

if __name__ == "__main__":
    print("YouTube Music OAuth Setup")
    print("=" * 60)

    if setup_oauth():
        print()
        print("🎉 Setup complete! You can now use the MCP server with OAuth.")
        print("The server will automatically use browser.json for authentication.")
        sys.exit(0)
    else:
        print()
        print("❌ Setup failed. Please check the errors above.")
        sys.exit(1)
