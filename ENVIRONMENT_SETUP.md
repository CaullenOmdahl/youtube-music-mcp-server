# Environment Variables Setup for OAuth

## Overview

The OAuth implementation uses environment variables for Google OAuth credentials, keeping sensitive information out of the codebase.

## Required Environment Variables

- `GOOGLE_CLIENT_ID` - Your Google OAuth 2.0 client ID
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth 2.0 client secret

## Getting OAuth Credentials

### 1. Go to Google Cloud Console
Visit https://console.cloud.google.com/

### 2. Create or Select Project
- Click "Select a project" → "New Project"
- Name it (e.g., "YouTube Music MCP")
- Click "Create"

### 3. Enable YouTube Data API
- Go to "APIs & Services" → "Library"
- Search for "YouTube Data API v3"
- Click on it and press "Enable"

### 4. Create OAuth Credentials
- Go to "APIs & Services" → "Credentials"
- Click "Create Credentials" → "OAuth client ID"
- If prompted, configure OAuth consent screen first:
  - User Type: External
  - Add app name and your email
  - Add scopes: `youtube.readonly` and `youtube`
- For Application type, select "TVs and Limited Input devices"
- Click "Create"

### 5. Save Your Credentials
You'll receive:
- Client ID: `975146857853-xxxxx.apps.googleusercontent.com`
- Client Secret: `GOCSPX-xxxxxxxxxxxxx`

## Setting Environment Variables

### For Local Development

Create a `.env` file (never commit this!):
```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

Or export them:
```bash
export GOOGLE_CLIENT_ID="your_client_id_here"
export GOOGLE_CLIENT_SECRET="your_client_secret_here"
```

### For Docker

Run with `-e` flags:
```bash
docker run -p 8080:8080 \
  -e GOOGLE_CLIENT_ID="your_client_id" \
  -e GOOGLE_CLIENT_SECRET="your_client_secret" \
  youtube-music-oauth
```

Or use docker-compose.yml:
```yaml
version: '3.8'
services:
  youtube-music:
    build: .
    ports:
      - "8080:8080"
    environment:
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
```

### For Smithery Deployment

1. Go to your Smithery dashboard
2. Navigate to your MCP server deployment settings
3. Add environment variables:
   - Key: `GOOGLE_CLIENT_ID`, Value: `your_client_id`
   - Key: `GOOGLE_CLIENT_SECRET`, Value: `your_client_secret`
4. Deploy or restart the server

### For GitHub Actions (CI/CD)

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add:
   - Name: `GOOGLE_CLIENT_ID`, Value: your client ID
   - Name: `GOOGLE_CLIENT_SECRET`, Value: your client secret

## Security Best Practices

### DO:
- ✅ Use environment variables for credentials
- ✅ Keep `.env` files in `.gitignore`
- ✅ Use secret management services in production
- ✅ Rotate credentials periodically
- ✅ Use different credentials for dev/staging/prod

### DON'T:
- ❌ Hardcode credentials in code
- ❌ Commit `.env` files to version control
- ❌ Share credentials in plain text
- ❌ Use production credentials in development
- ❌ Log or print credentials

## Fallback Behavior

The server checks for credentials in this order:
1. Environment variables (preferred)
2. `oauth.json` file (for local development only)
3. Returns error if neither is available

## Verification

Test that environment variables are set:
```bash
# Check if set (doesn't show value)
echo ${GOOGLE_CLIENT_ID:?Not set}
echo ${GOOGLE_CLIENT_SECRET:?Not set}

# Python verification
python -c "import os; print('✓' if os.getenv('GOOGLE_CLIENT_ID') else '✗')"
```

## Troubleshooting

### "OAuth credentials not configured"
- Ensure environment variables are set
- Check spelling and case (must be exact)
- Restart the container/server after setting

### "Invalid client" error from Google
- Verify credentials are correct
- Check that YouTube Data API is enabled
- Ensure OAuth consent screen is configured

### Environment variables not working in Docker
- Use `--env-file .env` or `-e` flags
- Check Docker Compose syntax
- Verify variables are exported in shell

## Example .env.example

Create this file to show required variables (commit this):
```bash
# Copy to .env and fill in your values
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

## Summary

Using environment variables:
1. Keeps credentials secure
2. Allows different configs per environment
3. Follows cloud deployment best practices
4. Makes the codebase shareable without exposing secrets