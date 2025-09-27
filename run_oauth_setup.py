#!/usr/bin/env python3
"""
Interactive OAuth Setup for YouTube Music

Run this script to authenticate with YouTube Music using OAuth.
This will create a browser.json file that the MCP server can use.
"""

import json
import sys
import os
from pathlib import Path

def main():
    print("YouTube Music OAuth Setup")
    print("=" * 60)

    # Check for oauth.json
    oauth_file = Path("oauth.json")
    if not oauth_file.exists():
        print("❌ oauth.json not found!")
        print("This file should contain your YouTube Data API credentials.")
        return 1

    # Read OAuth credentials
    with open(oauth_file, 'r') as f:
        oauth_data = json.load(f)

    client_id = oauth_data['installed']['client_id']
    client_secret = oauth_data['installed']['client_secret']

    print(f"Client ID: {client_id[:30]}...")
    print(f"Client Secret: {client_secret[:10]}...")
    print()

    # Run the OAuth setup
    print("Starting OAuth authentication flow...")
    print("-" * 60)

    # Create the command with credentials
    cmd = f'ytmusicapi oauth --client_id "{client_id}" --client_secret "{client_secret}"'

    print("Running OAuth setup...")
    print("You will be prompted to visit a URL and authorize access.")
    print()

    # Execute the command
    result = os.system(cmd)

    if result == 0:
        # Check if browser.json was created
        browser_file = Path("browser.json")
        if browser_file.exists():
            print()
            print("✅ OAuth setup completed successfully!")
            print("The browser.json file has been created.")
            print()

            # Test the authentication
            print("Testing authentication...")
            test_cmd = """python -c "
from ytmusicapi import YTMusic
yt = YTMusic('browser.json')
results = yt.search('test', limit=1)
if results:
    print('✅ Authentication working!')
else:
    print('⚠️  Authentication may have issues')
"
"""
            os.system(test_cmd)
            return 0
        else:
            print("⚠️  OAuth completed but browser.json not found")
            return 1
    else:
        print("❌ OAuth setup failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
