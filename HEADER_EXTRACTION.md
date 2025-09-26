# Complete Guide: Extracting Headers for YouTube Music Authentication

Based on the official ytmusicapi documentation, here's exactly how to extract the required headers.

## What You Need

You need to copy **request headers** from a POST request to YouTube Music. The headers in your `headers.txt` file are perfect and contain everything needed.

## Step-by-Step Instructions

### Method 1: Chrome/Edge (Recommended)

1. **Open YouTube Music**
   - Go to [music.youtube.com](https://music.youtube.com)
   - Sign in to your account

2. **Open Developer Tools**
   - Press `F12` or right-click → "Inspect"
   - Go to the **Network** tab

3. **Find a POST Request**
   - Click around in YouTube Music (play a song, browse, etc.)
   - Look for requests to `/youtubei/v1/browse` or similar
   - Filter by "Fetch/XHR" to see only API requests
   - Look for requests with method "POST"

4. **Copy Request Headers**
   - Click on any POST request (like the one in your headers.txt)
   - In the Headers panel, look for "Request Headers" section
   - Find the "view source" or "Raw" toggle and click it
   - Select and copy EVERYTHING from the first line to the last line

   It should look like this:
   ```
   :authority: music.youtube.com
   :method: POST
   :path: /youtubei/v1/browse?...
   [... many more lines ...]
   x-youtube-client-version: 1.20250922.03.00
   ```

### Method 2: Firefox

1. **Open YouTube Music** and sign in
2. **Open Developer Tools** (F12)
3. Go to **Network** tab
4. Click around to generate requests
5. Find a POST request
6. Right-click the request → Copy → **Copy Request Headers**

### What the Headers Must Include

Based on your `headers.txt`, these are the critical headers that MUST be present:

✅ **Cookie Headers** (contains your session):
```
cookie: VISITOR_INFO1_LIVE=...; SID=...; HSID=...; SSID=...; APISID=...; SAPISID=...; LOGIN_INFO=...
```

✅ **Authorization Headers** (generated from SAPISID):
```
authorization: SAPISIDHASH ... SAPISID1PHASH ... SAPISID3PHASH ...
```

✅ **Client Information**:
```
x-youtube-client-name: 67
x-youtube-client-version: 1.20250922.03.00
x-goog-authuser: 2
```

✅ **Standard HTTP Headers**:
```
accept: */*
user-agent: Mozilla/5.0 ...
referer: https://music.youtube.com/
origin: https://music.youtube.com
```

## Your headers.txt File

**Good news!** Your `headers.txt` file contains ALL the required headers. It's a complete POST request with:
- ✅ All cookies (VISITOR_INFO1_LIVE, SID, SAPISID, etc.)
- ✅ Authorization headers (SAPISIDHASH)
- ✅ Client identifiers
- ✅ Standard HTTP headers

This is exactly what ytmusicapi needs!

## How to Use Your Headers

### For the MCP Server

Simply copy the entire content of your `headers.txt` file (from `:authority:` to the last line) and paste it into the `youtube_music_headers` configuration field.

### For ytmusicapi Setup

```python
# Read your headers file
with open('headers.txt', 'r') as f:
    headers = f.read()

# Setup ytmusicapi
from ytmusicapi import setup
auth = setup(headers_raw=headers)

# Now use it
from ytmusicapi import YTMusic
ytmusic = YTMusic(auth)
```

## Important Notes

1. **Headers expire**: These headers will work as long as your browser session is valid (typically 2+ weeks if you stayed signed in)

2. **Privacy**: Your headers contain authentication tokens. Never share them publicly!

3. **Browser matters**: Use the same browser where you're logged into YouTube Music

4. **Format matters**: Copy the ENTIRE request headers, including the `:authority:`, `:method:`, etc. lines

## Troubleshooting

### "Headers missing cookie information"
- Make sure you copied ALL lines, including the `cookie:` line

### "401 Unauthorized" 
- Your session expired. Get fresh headers from the browser

### "400 Bad Request"
- You might have copied response headers instead of request headers
- Make sure it's from a POST request, not GET

## Quick Test

To verify your headers work:
```python
from ytmusicapi import setup, YTMusic

# Test with your headers
headers = open('headers.txt').read()
auth = setup(headers_raw=headers)
yt = YTMusic(auth)

# Try a simple operation
playlists = yt.get_library_playlists()
print(f"Found {len(playlists)} playlists!")
```

## Summary

Your `headers.txt` file is **perfect** and contains everything needed:
- Request method and path
- All authentication cookies
- Authorization hashes
- Client identifiers
- Standard headers

Just copy this entire content when configuring the MCP server!