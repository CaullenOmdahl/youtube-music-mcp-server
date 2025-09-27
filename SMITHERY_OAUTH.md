# Smithery-Compliant OAuth Setup for YouTube Music MCP Server

## The Challenge

Smithery servers are stateless containers that cannot:
- Store persistent files (like browser.json)
- Run interactive OAuth flows
- Access local files from your machine

## The Solution

You authenticate locally and provide the tokens to Smithery through configuration.

## Step-by-Step Setup

### 1. Local OAuth Setup (One-time)

First, set up OAuth authentication on your local machine:

```bash
# Clone the repository
git clone https://github.com/your-repo/youtube-music-mcp-server.git
cd youtube-music-mcp-server

# Run OAuth setup
python run_oauth_setup.py
```

This will:
1. Open a browser for Google authorization
2. Generate a `browser.json` file with refresh tokens

### 2. Get Your OAuth Tokens

After successful OAuth setup, view your tokens:

```bash
cat browser.json
```

You'll see something like:
```json
{
  "refresh_token": "1//0gLongStringHere...",
  "client_id": "975146857853-...",
  "client_secret": "GOCSPX-...",
  "expires_at": 1234567890
}
```

### 3. Configure Smithery

In your Smithery MCP client:

1. Go to the YouTube Music server settings
2. In the `oauth_tokens` field, paste the ENTIRE contents of your browser.json
3. Leave `youtube_music_headers` empty
4. Save configuration

## How It Works

The server:
1. Receives your OAuth tokens as a string through configuration
2. Creates a temporary file with the tokens
3. Uses ytmusicapi with the OAuth tokens
4. Cleans up the temporary file

## Benefits

✅ **Fully Smithery-compliant** - No local files needed in the container
✅ **Persistent authentication** - OAuth tokens refresh automatically
✅ **Secure** - Tokens are passed through Smithery's secure configuration
✅ **No expiration issues** - Unlike browser headers that expire in hours

## Security Note

Keep your OAuth tokens secure! They provide access to your YouTube Music account.

## Troubleshooting

### "Invalid OAuth tokens"
- Ensure you copied the entire browser.json contents
- Check that JSON formatting is preserved

### "401 Unauthorized"
- Your tokens may have been revoked
- Run the local OAuth setup again

### Need to revoke access?
Go to: https://myaccount.google.com/permissions
Find the YouTube Music app and revoke access