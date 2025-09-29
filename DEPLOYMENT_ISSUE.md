# Smithery Deployment Issue Analysis

## Problem Summary
YouTube Music MCP Server deployment is failing on Smithery.ai platform. Docker build succeeds but deployment fails during "Deploy Server" phase after 4+ minutes.

## Background
- Repository: https://github.com/CaullenOmdahl/youtube-music-mcp-server.git
- Latest commit: 5056f7a (Convert to single-stage Docker build)
- Platform: Smithery.ai container deployment
- Runtime: Python FastMCP server with streamable HTTP transport

## Previous Fixes Applied
1. ✅ **Fixed FastMCP Protocol**: Changed from stdio to streamable-http transport for Smithery compatibility
2. ✅ **Fixed Encryption Key Validation**: Added 32-byte key validation and auto-generation
3. ✅ **Added Health Endpoint**: Custom `/health` endpoint for container monitoring
4. ✅ **Optimized Dependencies**: Reduced build time from 12+ minutes to ~4 minutes
5. ✅ **Simplified Docker Build**: Converted from multi-stage to single-stage build to eliminate layer copying issues
6. ✅ **Verified Smithery Requirements**:
   - ✅ `/mcp` endpoint with GET/POST/DELETE methods
   - ✅ Listens on PORT environment variable
   - ✅ Streamable HTTP protocol

## Current Status
- **Docker Build**: ✅ Succeeds (all 19 steps complete)
- **Local Container Test**: ✅ Works (health endpoint responds, MCP endpoint accessible)
- **Smithery Deployment**: ❌ Fails during "Deploy Server" phase

## Root Cause Identified
**Critical Issue in server.py:614-618**: Incorrect async event loop management

```python
# PROBLEMATIC CODE:
asyncio.run(startup())     # Line 614 - Creates loop, runs startup, CLOSES loop
try:
    server.mcp.run(transport="streamable-http")  # Line 618 - Needs event loop but it's closed!
finally:
    asyncio.run(cleanup())  # Line 621 - Creates new loop for cleanup
```

**Problem**:
1. `asyncio.run(startup())` creates an event loop, runs async startup, then **closes the loop**
2. `server.mcp.run()` expects an active event loop to run the FastMCP server
3. This creates a race condition where FastMCP fails because no event loop exists

## Smithery Deployment Requirements (Verified)
Based on Context7 documentation review:
- ✅ Runtime: "container"
- ✅ Endpoint: `/mcp` path
- ✅ Methods: GET, POST, DELETE supported
- ✅ Port: Reads from PORT environment variable (default 8081)
- ✅ Transport: Streamable HTTP protocol
- ✅ Configuration: Handles query parameters via dot-notation

## Next Steps
1. **Fix Event Loop Management**: Refactor startup sequence to maintain single event loop
2. **Test Locally**: Verify fix works in Docker container
3. **Commit and Deploy**: Push fix to trigger new Smithery deployment

## Files Requiring Changes
- `/home/caullen/Documents/github/YTMusicPlugin/ytmusic_server/server.py` (lines 601-624)

## Error Pattern
- Build succeeds completely through all Docker steps
- Deployment fails during server startup (not during inspection)
- No specific error message in logs - just "FAILURE" after 4+ minutes

## Environment
- Working directory: `/home/caullen/Documents/github/YTMusicPlugin`
- Git branch: main
- Docker group issue in current Claude Code session (works in other terminals)
- User has necessary permissions, just session-specific issue

## Testing Commands (for next session)
```bash
# Test Docker build
docker build -t ytmusic-mcp-test .

# Test container startup
docker run --rm -p 8081:8081 \
  -e GOOGLE_OAUTH_CLIENT_ID="test-client-id" \
  -e GOOGLE_OAUTH_CLIENT_SECRET="test-client-secret" \
  -e ENCRYPTION_KEY="$(python3 -c 'import base64; import os; print(base64.b64encode(os.urandom(32)).decode())')" \
  ytmusic-mcp-test

# Test endpoints
curl http://localhost:8081/health
curl -H "Accept: text/event-stream" http://localhost:8081/mcp
```