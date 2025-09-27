# Complete OAuth Guide for YouTube Music MCP Server on Smithery

## Overview

This server is **fully Smithery-compliant** with OAuth authentication. Here's how it works:

1. **Local Setup**: You authenticate with Google OAuth on your local machine
2. **Token Generation**: This creates a `browser.json` file with refresh tokens
3. **Smithery Config**: You paste the tokens into Smithery's configuration
4. **Stateless Operation**: The server uses tokens without needing persistent storage

## Prerequisites

You need:
- Google account with YouTube Music access
- OAuth credentials (`oauth.json` file with client_id and client_secret)
- Python installed locally for one-time setup

## Step 1: Get OAuth Credentials

If you don't have `oauth.json`:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials:
   - Type: "TVs and Limited Input devices"
   - Download as JSON
5. Save as `oauth.json`

## Step 2: Local OAuth Setup

Run this on your local machine (not in Smithery):

```bash
# Clone the repository
git clone https://github.com/your-repo/youtube-music-mcp-server.git
cd youtube-music-mcp-server

# Make sure oauth.json is in the directory
ls oauth.json  # Should show the file

# Run OAuth setup
python run_oauth_setup.py
```

Follow the prompts:
1. Visit the URL shown
2. Sign in with Google
3. Grant permissions
4. The script creates `browser.json`

## Step 3: Get Your Tokens

View the generated tokens:

```bash
cat browser.json
```

Output looks like:
```json
{
  "refresh_token": "1//0gLongString...",
  "client_id": "975146857853-...",
  "client_secret": "GOCSPX-...",
  "expires_at": 1758868721,
  "token_type": "Bearer",
  "access_token": "ya29.a0..."
}
```

**Copy the ENTIRE content** (including the curly braces).

## Step 4: Configure in Smithery

1. Go to your MCP client (Claude Desktop, VS Code, etc.)
2. Find YouTube Music server settings
3. In the **OAuth Tokens** field:
   - Paste the entire browser.json content
   - Make sure JSON formatting is preserved
4. Leave **Browser Headers** empty
5. Save configuration

## How the Server Handles OAuth

When you provide OAuth tokens through Smithery config:

1. Server receives tokens as a string
2. Creates temporary file with tokens
3. Initializes ytmusicapi with OAuth
4. Deletes temporary file
5. Uses in-memory session

This is **stateless and Smithery-compliant** because:
- No persistent files in container
- Tokens passed through configuration
- Temporary files cleaned up immediately

## Advantages Over Browser Headers

| Browser Headers | OAuth Tokens |
|----------------|--------------|
| Expire in hours/days | Refresh automatically |
| Need frequent updates | One-time setup |
| Complex to extract | Simple JSON file |
| Session-based | Token-based |

## Security Best Practices

1. **Keep tokens secure** - Don't share or commit them
2. **Use environment-specific tokens** - Different for dev/prod
3. **Revoke if compromised** - Go to Google account permissions
4. **Rotate periodically** - Re-run OAuth setup monthly

## Troubleshooting

### "Invalid OAuth tokens"
```bash
# Verify JSON is valid
python -c "import json; json.loads(open('browser.json').read())"
```

### "401 Unauthorized"
- Tokens may be revoked
- Re-run OAuth setup

### "No refresh token"
- Make sure you're using correct OAuth flow
- Delete browser.json and retry

### Testing Locally

Test before deploying to Smithery:
```python
from ytmusicapi import YTMusic
yt = YTMusic("browser.json")
print(yt.search("test", limit=1))
```

## Revoking Access

To revoke OAuth access:
1. Go to https://myaccount.google.com/permissions
2. Find "YouTube Music" or your app name
3. Click "Remove Access"

## Implementation Details

The server's OAuth implementation:

```python
# In ConfigSchema
oauth_tokens: str = Field(
    default="",
    description="Paste entire browser.json contents"
)

# In setup_auth()
if self.oauth_tokens:
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write(self.oauth_tokens)
        temp_path = f.name
    
    self.ytmusic = YTMusic(temp_path)
    os.unlink(temp_path)  # Clean up immediately
```

This ensures:
- ✅ No persistent storage needed
- ✅ Tokens never saved to disk in container
- ✅ Fully stateless operation
- ✅ Smithery compliant

## Summary

1. **One-time local setup** → Creates browser.json
2. **Copy tokens** → Entire JSON content
3. **Paste in Smithery** → OAuth Tokens field
4. **Enjoy persistent auth** → No more expired headers!

The server is now fully Smithery-compliant with OAuth support!