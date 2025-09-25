# Smithery Setup Guide - YouTube Music MCP Server

This guide walks you through setting up the YouTube Music MCP Server on Smithery, including obtaining the required cookies.

## Quick Start

1. **Install the server** from [Smithery](https://smithery.ai/server/youtube-music)
2. **Get your cookies** using the instructions below
3. **Configure the server** with your cookie string
4. **Start using** natural language commands with Claude

## Step-by-Step Cookie Extraction

### Prerequisites

- A Google account signed into [YouTube Music](https://music.youtube.com)
- A modern web browser (Chrome, Firefox, Edge, or Safari)

### Method 1: Quick Copy (Recommended for Technical Users)

1. **Open YouTube Music**
   - Go to [https://music.youtube.com](https://music.youtube.com)
   - Make sure you're signed in to your account

2. **Open Browser Console**
   - Press `F12` (Windows/Linux) or `Cmd + Option + I` (Mac)
   - Click on the "Console" tab

3. **Copy All Cookies**
   ```javascript
   // Paste this command in the console and press Enter
   copy(document.cookie)
   ```
   - Your cookies are now copied to clipboard!

4. **Paste in Smithery**
   - Go to your Smithery server settings
   - Paste the cookie string in the `youtube_music_cookies` field

### Method 2: Visual Guide (Recommended for Most Users)

#### Chrome/Edge Instructions

1. **Navigate to YouTube Music**
   - Open [https://music.youtube.com](https://music.youtube.com)
   - Sign in if not already logged in

2. **Open Developer Tools**
   - Right-click anywhere on the page
   - Select "Inspect" from the menu
   - Or press `F12`

3. **Access Cookies**
   
   ![Chrome DevTools Cookies](https://i.imgur.com/placeholder1.png)
   
   - Click on the "Application" tab (you may need to click >> to see it)
   - In the left sidebar, expand "Storage"
   - Expand "Cookies"
   - Click on `https://music.youtube.com`

4. **Collect Required Cookies**
   
   You need to copy the "Value" for each of these cookies:
   
   | Cookie Name | Required | Purpose |
   |------------|----------|---------|
   | VISITOR_INFO1_LIVE | ✅ | Visitor identification |
   | PREF | ✅ | User preferences |
   | LOGIN_INFO | ✅ | Login state |
   | SAPISID | ✅ | API authentication |
   | __Secure-3PAPISID | ✅ | Secure API auth |
   | __Secure-3PSID | ✅ | Secure session |
   | APISID | ✅ | API session ID |
   | HSID | ✅ | HTTP session ID |
   | SID | ✅ | Session ID |
   | SSID | ✅ | Secure session ID |
   | SIDCC | ✅ | Session security |
   | __Secure-3PSIDCC | ✅ | Secure session token |
   | YSC | ⚠️ | YouTube session |
   | SOCS | ⚠️ | Cookie consent |

5. **Format the Cookie String**
   
   Combine all cookies in this format:
   ```
   VISITOR_INFO1_LIVE=abc123; PREF=def456; LOGIN_INFO=ghi789; SAPISID=jkl012; ...
   ```
   
   **Important**: 
   - Separate each cookie with `; ` (semicolon + space)
   - Format is `NAME=VALUE; NAME=VALUE; ...`
   - Don't include quotes around values

#### Firefox Instructions

1. **Open YouTube Music** and sign in
2. **Open Developer Tools** (F12)
3. Click on the **"Storage"** tab (not Application)
4. Expand **"Cookies"** → Click **"https://music.youtube.com"**
5. Copy values for the required cookies listed above

#### Safari Instructions

1. **Enable Developer Menu**
   - Safari → Preferences → Advanced
   - Check "Show Develop menu in menu bar"
2. **Open YouTube Music** and sign in
3. **Open Web Inspector** (Develop → Show Web Inspector)
4. Click **"Storage"** tab → **"Cookies"**
5. Copy the required cookie values

### Method 3: Browser Extension (Easiest)

1. **Install a Cookie Manager Extension**
   - [EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg) for Chrome
   - [Cookie-Editor](https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/) for Firefox

2. **Export Cookies**
   - Go to YouTube Music
   - Click the extension icon
   - Click "Export" or "Copy all"
   - The extension will copy cookies in the correct format

3. **Clean the Export**
   - Remove any cookies not from `music.youtube.com`
   - Keep only the required cookies listed above

## Configuring in Smithery

### 1. Access Server Settings

After installing the server from Smithery:

1. Open your MCP client (e.g., Claude Desktop)
2. Go to Settings → MCP Servers
3. Find "YouTube Music" in your server list
4. Click "Configure" or "Settings"

### 2. Add Your Cookie String

In the configuration dialog:

```json
{
  "youtube_music_cookies": "PASTE_YOUR_COOKIE_STRING_HERE",
  "default_privacy": "PRIVATE"
}
```

### 3. Privacy Settings

Choose your default playlist privacy:
- `PRIVATE` - Only you can see (recommended)
- `UNLISTED` - Anyone with link can see
- `PUBLIC` - Everyone can find and see

### 4. Save and Test

1. Click "Save" or "Apply"
2. Restart your MCP client if needed
3. Test with a simple command: "Search for songs by Beatles"

## Verification

### Test Your Setup

Try these commands to verify everything works:

1. **Test Search** (No auth required):
   ```
   "Search for Bohemian Rhapsody"
   ```
   Should return search results even without cookies.

2. **Test Authentication** (Requires cookies):
   ```
   "Show me my playlists"
   ```
   Should list your YouTube Music playlists if cookies are valid.

3. **Test Playlist Creation**:
   ```
   "Create a test playlist called MCP Test"
   ```
   Should create a new playlist in your library.

### Troubleshooting

#### "YouTube Music cookies not configured"
- You haven't added cookies to the configuration
- Solution: Follow the cookie extraction steps above

#### "Authentication required" 
- Your cookies are invalid or expired
- Solution: Get fresh cookies from YouTube Music

#### Search works but playlists don't
- Cookies are partial or missing required values
- Solution: Ensure you have all required cookies, especially SAPISID

#### Cookies expire frequently
- Normal behavior - YouTube cookies last ~2 weeks
- Solution: Re-extract cookies when they expire

## Security Notes

### Your Cookies Are Safe

- ✅ **Cookies stay on Smithery's servers** - Never sent to third parties
- ✅ **Per-session isolation** - Your cookies are isolated from other users
- ✅ **No password needed** - We never ask for or store your password
- ✅ **Revocable** - Sign out of YouTube Music to revoke access instantly

### Best Practices

1. **Use a dedicated browser profile** for extracting cookies
2. **Update cookies regularly** (every 2 weeks)
3. **Don't share your cookie string** with others
4. **Sign out and back in** if you suspect compromise

## Common Use Cases

Once configured, you can:

### Music Discovery
- "Find upbeat workout songs from the 2000s"
- "Search for jazz albums by Miles Davis"
- "Show me instrumental study music"

### Playlist Management
- "Create a party playlist with top 40 hits"
- "Add this song to my workout playlist"
- "Remove duplicate songs from my playlist"
- "Make my playlist public"

### Assistant-Curated Playlist Creation
- "Create a playlist of songs similar to Radiohead and add 20 tracks"
- "Make a chill Sunday morning playlist with 30 songs"
- "Build a road trip playlist with classic rock hits"

## Advanced Configuration

### Using Environment Variables

For advanced users, you can set cookies via environment:

```bash
export YOUTUBE_MUSIC_COOKIES="your_cookie_string"
```

### Automation Scripts

You can automate cookie extraction:

```python
# save_cookies.py
import browser_cookie3
import json

cookies = browser_cookie3.chrome(domain_name='music.youtube.com')
cookie_dict = {c.name: c.value for c in cookies}
cookie_string = '; '.join([f"{k}={v}" for k, v in cookie_dict.items()])

with open('cookies.txt', 'w') as f:
    f.write(cookie_string)
```

## Getting Help

### Resources

- **GitHub Issues**: [Report problems here](https://github.com/CaullenOmdahl/youtube-music-mcp-server/issues)
- **Smithery Support**: [Smithery documentation](https://docs.smithery.ai/)
- **YouTube Music**: [Official help](https://support.google.com/youtubemusic)

### Common Questions

**Q: How often do I need to update cookies?**
A: Typically every 2 weeks, or when you see authentication errors.

**Q: Can I use cookies from an incognito window?**
A: No, incognito cookies expire when you close the browser.

**Q: Will this affect my YouTube recommendations?**
A: No, the server only reads data and manages playlists as requested.

**Q: Can I use this with a brand account?**
A: Yes, just make sure you're signed into the correct account when extracting cookies.

**Q: Is this legal?**
A: Yes, you're using your own account credentials to access your own content.

## Next Steps

Now that you're set up:

1. **Explore Features**: Try different commands to see what's possible
2. **Create Playlists**: Build your perfect music collections
3. **Share Feedback**: Let us know what features you'd like
4. **Contribute**: The project is open source - PRs welcome!

---

*Last Updated: January 2024*
*Server Version: 1.0.0*