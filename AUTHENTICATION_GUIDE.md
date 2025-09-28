# YouTube Music MCP Server - Authentication Guide

## Overview
This server uses OAuth 2.0 with Google to authenticate and access your YouTube Music account. Here's how to set it up.

## Step 1: Create Google OAuth Credentials

### 1.1 Go to Google Cloud Console
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Make sure you're in the correct project

### 1.2 Enable YouTube Data API
1. Go to **APIs & Services** → **Library**
2. Search for "YouTube Data API v3"
3. Click on it and press **ENABLE**

### 1.3 Create OAuth 2.0 Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted, configure the OAuth consent screen first:
   - Choose "External" for user type
   - Fill in required fields (app name, support email, etc.)
   - Add your email to test users
   - Add scopes: `https://www.googleapis.com/auth/youtube`

4. For Application type, select **Web application**
5. Add authorized redirect URIs:
   - For local testing: `http://localhost:8081/oauth/callback`
   - For Smithery: `https://your-server.smithery.ai/oauth/callback`
   
6. Click **CREATE**
7. Save the **Client ID** and **Client Secret**

## Step 2: Configure the Server

### For Local Testing

Set environment variables:

```bash
export GOOGLE_CLIENT_ID="your-client-id-here.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret-here"
export OAUTH_REDIRECT_URI="http://localhost:8081/oauth/callback"
export TRANSPORT=http
export PORT=8081

# Run the server
python main.py
```

### For Smithery Deployment

1. Go to your server's settings on Smithery
2. Add environment variables:
   - `GOOGLE_CLIENT_ID` = your client ID
   - `GOOGLE_CLIENT_SECRET` = your client secret
   - `OAUTH_REDIRECT_URI` = `https://your-server.smithery.ai/oauth/callback`

## Step 3: Authenticate

### Using the Server

1. When you first use a tool that requires authentication (like `search_music`), the server will return an error indicating you need to authenticate.

2. Visit the authorization URL:
   - Local: `http://localhost:8081/oauth/authorize`
   - Smithery: `https://your-server.smithery.ai/oauth/authorize`

3. You'll see a page with a "Authorize with Google" button

4. Click the button to be redirected to Google

5. Sign in with your Google account and authorize the app

6. You'll be redirected back with a success message

7. The server now has access to your YouTube Music account!

## Step 4: Test Authentication

### Test with cURL (Local)

```bash
# 1. Initialize MCP session
SESSION_ID=$(curl -s -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "0.1.0",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    },
    "id": 1
  }' -D - | grep mcp-session-id | cut -d' ' -f2 | tr -d '\r')

# 2. Check auth status
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_auth_status",
      "arguments": {"session_id": "'$SESSION_ID'"}
    },
    "id": 2
  }'
```

### Test with Python

```python
import requests
import json

# Initialize session
response = requests.post(
    "http://localhost:8081/mcp",
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
            "clientInfo": {"name": "test", "version": "1.0"}
        },
        "id": 1
    }
)

session_id = response.headers.get('mcp-session-id')
print(f"Session ID: {session_id}")

# Complete OAuth flow manually by visiting:
print(f"Visit: http://localhost:8081/oauth/authorize")
print("Complete the OAuth flow, then press Enter to continue...")
input()

# Now try searching music
response = requests.post(
    "http://localhost:8081/mcp",
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
                "query": "Beatles",
                "session_id": session_id
            }
        },
        "id": 2
    }
)

print(response.text)
```

## Important Notes

### Security Considerations
1. **Never commit credentials** to your repository
2. Use environment variables or secure secret management
3. The OAuth tokens are stored in memory (lost on server restart)
4. For production, consider implementing persistent token storage

### Scopes Required
The server requests the `https://www.googleapis.com/auth/youtube` scope which provides:
- Read access to YouTube/YouTube Music data
- Ability to create and manage playlists
- Search functionality

### Token Refresh
The server automatically handles token refresh when tokens expire. The refresh token is stored along with the access token.

### Session Management
- Each MCP client gets a unique session ID
- OAuth tokens are tied to the session
- Multiple clients can authenticate independently

## Troubleshooting

### "Not authenticated" error
- Make sure you've completed the OAuth flow
- Check that your session ID is being passed correctly
- Verify the OAuth credentials are set correctly

### "Invalid client" error from Google
- Double-check your Client ID and Secret
- Ensure the redirect URI matches exactly
- Make sure the YouTube Data API is enabled

### Can't access certain YouTube Music features
- YouTube Music API has some limitations
- Not all features available in the app are accessible via API
- Some features require YouTube Music Premium

### Token expired
- The server should auto-refresh tokens
- If not working, re-authenticate by visiting `/oauth/authorize`

## Alternative: Using ytmusicapi OAuth

For a more streamlined experience, you can also use ytmusicapi's built-in OAuth:

```bash
# Generate OAuth credentials file
ytmusicapi oauth

# This will create a file: oauth.json
# Copy this file to the server and set:
export YTMUSIC_AUTH_FILE="/path/to/oauth.json"
```

This method bypasses the web OAuth flow and uses a pre-generated token file.

## Next Steps

Once authenticated, you can use all the YouTube Music tools:
- `search_music` - Search for songs, albums, artists
- `create_playlist` - Create new playlists
- `add_songs_to_playlist` - Add songs to playlists
- `get_playlists` - List your playlists
- `get_playlist_details` - Get playlist information

The authentication persists for the session duration. For production use, consider implementing a database to store refresh tokens persistently.