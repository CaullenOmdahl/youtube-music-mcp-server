# How to Refresh YouTube Music Headers

Your authentication headers have expired (401 Unauthorized error). Follow these steps to get new headers:

## Quick Steps:

1. **Open Chrome/Firefox**
2. **Go to** https://music.youtube.com
3. **Sign in** if not already logged in
4. **Open Developer Tools** (F12)
5. **Go to Network tab**
6. **Play any song** or click around to generate network requests
7. **Find any POST request** to `music.youtube.com`
   - Look for requests to `/youtubei/v1/browse` or `/youtubei/v1/next`
8. **Right-click the request** → Copy → Copy as cURL (bash)
9. **Paste into a text editor**
10. **Extract just the headers** (everything with `-H` flags)
11. **Save to headers.txt** in this directory

## What the headers should look like:

```
accept: */*
accept-encoding: gzip, deflate, br
accept-language: en-US,en;q=0.9
authorization: SAPISIDHASH [long_string]
cookie: [long cookie string with LOGIN_INFO, HSID, SSID, etc.]
referer: https://music.youtube.com/
user-agent: Mozilla/5.0 ...
x-youtube-client-name: 67
x-youtube-client-version: 1.20250116.01.00
```

## Important headers that MUST be present:
- `cookie:` (with SAPISID, HSID, SID tokens)
- `authorization:` (with SAPISIDHASH)
- `x-goog-authuser:`
- `x-youtube-client-name:`
- `x-youtube-client-version:`

## Tips:
- Use an incognito/private window if having issues
- Make sure you're signed into YouTube Music, not just YouTube
- The headers expire after a few hours to days
- Keep the browser tab open to extend session life