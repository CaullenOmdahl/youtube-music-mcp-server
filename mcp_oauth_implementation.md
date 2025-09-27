# Implementing MCP Protocol OAuth for YouTube Music

## The Difference

Our current implementation:
```
User → Google OAuth → browser.json → Copy/Paste → Smithery Config → Server
```

MCP Protocol OAuth (like the example):
```
Client → MCP Server → Google OAuth → Automatic Token Management
```

## To Implement MCP Protocol OAuth

### 1. Add OAuth Endpoints to main.py

```python
# main.py additions
from starlette.responses import JSONResponse, RedirectResponse
import httpx
import secrets
import json

# OAuth endpoints
@app.get("/oauth/authorize")
async def oauth_authorize(request: Request):
    """MCP OAuth: Start authorization flow"""
    # Get callback URL from client
    callback_url = request.query_params.get("redirect_uri", "http://localhost:3000/callback")
    state = secrets.token_urlsafe(32)
    
    # Store state in session
    request.session["oauth_state"] = state
    request.session["callback_url"] = callback_url
    
    # Build Google OAuth URL
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={CLIENT_ID}&"
        f"redirect_uri={callback_url}&"
        "response_type=code&"
        "scope=https://www.googleapis.com/auth/youtube&"
        f"state={state}&"
        "access_type=offline&"
        "prompt=consent"
    )
    
    return JSONResponse({
        "auth_url": google_auth_url,
        "state": state
    })

@app.post("/oauth/token")
async def oauth_token(request: Request):
    """MCP OAuth: Exchange code for tokens"""
    data = await request.json()
    code = data.get("code")
    state = data.get("state")
    
    # Verify state
    if state != request.session.get("oauth_state"):
        return JSONResponse({"error": "Invalid state"}, status_code=400)
    
    # Exchange with Google
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code": code,
                "redirect_uri": request.session.get("callback_url"),
                "grant_type": "authorization_code"
            }
        )
    
    tokens = response.json()
    
    # Create browser.json format for ytmusicapi
    browser_json = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_at": tokens["expires_in"] + int(time.time()),
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET
    }
    
    # Store in session
    request.session["youtube_tokens"] = json.dumps(browser_json)
    
    return JSONResponse({
        "access_token": tokens["access_token"],
        "token_type": "Bearer",
        "expires_in": tokens["expires_in"]
    })

@app.post("/oauth/refresh")
async def oauth_refresh(request: Request):
    """MCP OAuth: Refresh access token"""
    data = await request.json()
    refresh_token = data.get("refresh_token")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            }
        )
    
    new_tokens = response.json()
    
    return JSONResponse({
        "access_token": new_tokens["access_token"],
        "token_type": "Bearer",
        "expires_in": new_tokens["expires_in"]
    })
```

### 2. Update smithery.yaml

```yaml
runtime: "container"
build:
  dockerfile: "Dockerfile"
  dockerBuildPath: "."
startCommand:
  type: "http"
  authentication:
    type: "oauth2"
    authorizationEndpoint: "/oauth/authorize"
    tokenEndpoint: "/oauth/token"
    refreshEndpoint: "/oauth/refresh"
    scopes:
      - "youtube"
  # No configSchema needed - OAuth handles auth!
```

### 3. Update middleware.py

```python
class OAuthMiddleware:
    """Extract OAuth tokens from Authorization header"""
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope["headers"])
            auth_header = headers.get(b"authorization", b"").decode()
            
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                # Store token for MCP server to use
                scope["oauth_token"] = token
```

### 4. Update server.py

```python
def get_ytmusic(ctx: Context) -> Optional[YouTubeMusicAPI]:
    """Get YTMusic instance from OAuth session"""
    
    # Check for OAuth token in context
    if hasattr(ctx, 'oauth_token'):
        # Token provided by MCP OAuth flow
        # Create temporary browser.json with token
        browser_data = {
            "access_token": ctx.oauth_token,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as f:
            json.dump(browser_data, f)
            f.flush()
            yt = YTMusic(f.name)
        
        return yt
    
    # Fallback to config-based auth
    # ... existing code ...
```

## Benefits of MCP Protocol OAuth

✅ **Zero Configuration** - User never sees tokens
✅ **Automatic Setup** - OAuth happens on first use
✅ **Token Management** - MCP client handles refresh
✅ **Better UX** - Click "Authorize" and done
✅ **More Secure** - Tokens never exposed to user

## Challenges

❌ **More Complex** - Requires OAuth endpoint implementation
❌ **Session Management** - Need to track OAuth states
❌ **Smithery Support** - Needs Smithery to support OAuth in their runtime
❌ **Client Support** - MCP client must support OAuth flow

## Current Status

Smithery may not yet support the full MCP OAuth protocol. Our current implementation (paste tokens in config) works TODAY and is fully Smithery-compliant.

When Smithery adds OAuth support, we can upgrade to this implementation!