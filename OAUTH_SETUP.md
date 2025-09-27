# YouTube Music OAuth Setup Guide

## Overview

This MCP server now supports OAuth authentication, which is more reliable than browser headers that expire. OAuth provides persistent authentication using refresh tokens.

## Setup Instructions

### Step 1: Run the OAuth Setup Script

```bash
python run_oauth_setup.py
```

This will:
1. Use your existing `oauth.json` credentials
2. Open a browser for Google authorization
3. Create a `browser.json` file with refresh tokens

### Step 2: Complete Authorization

When prompted:
1. Visit the URL shown in the terminal
2. Sign in with your Google account (the one you use for YouTube Music)
3. Grant permissions to access YouTube Music
4. Return to the terminal and press Enter

### Step 3: Verify Authentication

The script will automatically test if authentication is working.

## Using OAuth in the MCP Server

### Option 1: Automatic (Recommended)
If `browser.json` exists, the server will automatically use OAuth authentication.

### Option 2: Manual Configuration
In Smithery or your MCP client, set:
```json
{
  "use_oauth": true
}
```

## Benefits of OAuth

✅ **Persistent Authentication** - Refresh tokens don't expire like browser cookies
✅ **No Manual Updates** - No need to copy headers every few hours
✅ **Secure** - OAuth tokens are managed by Google's authentication system
✅ **Reliable** - Less prone to authentication errors

## Troubleshooting

### "OAuth enabled but browser.json not found"
Run `python run_oauth_setup.py` to create the browser.json file.

### "401 Unauthorized" errors
Your tokens may have been revoked. Run the setup script again.

### Can't complete OAuth flow
1. Make sure you're using the correct Google account
2. Check that you have YouTube Music access on that account
3. Try in an incognito/private browser window

## Switching Between Auth Methods

- **Use OAuth**: Set `use_oauth: true` in config (or let it auto-detect browser.json)
- **Use Headers**: Set `use_oauth: false` and provide headers in `youtube_music_headers`

## Security Note

Keep your `browser.json` file secure - it contains refresh tokens that provide access to your YouTube Music account.