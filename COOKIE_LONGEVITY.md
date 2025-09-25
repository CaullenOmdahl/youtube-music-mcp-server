# Maximizing YouTube Music Cookie Lifespan

## Why Cookies Expire Quickly

YouTube Music cookies typically expire for several reasons:
- Security measures by Google
- Session timeout settings
- Browser privacy features
- Missing critical cookies

## How to Get Longer-Lasting Cookies

### 1. Sign In with "Stay Signed In"

**Most Important**: When signing into YouTube Music:
1. Go to [music.youtube.com](https://music.youtube.com)
2. Click "Sign In"
3. ✅ **CHECK "Stay signed in" or "Remember me"**
4. Complete sign-in

This can extend cookie life from hours to weeks.

### 2. Use Your Primary Browser Profile

**Don't use**:
- ❌ Incognito/Private mode (cookies expire on close)
- ❌ Guest profiles
- ❌ Temporary browser sessions

**Do use**:
- ✅ Your main browser profile
- ✅ Browser where you stay logged into Google services
- ✅ Browser with sync enabled

### 3. Extract ALL Required Cookies

Missing any of these critical cookies will cause early expiration:

```
Required Cookies (in order of importance):
1. SAPISID          - API authentication (lasts longest)
2. __Secure-3PAPISID - Secure API access
3. LOGIN_INFO       - Contains session duration
4. HSID            - HTTP session ID
5. SSID            - Secure session ID  
6. SID             - Session identifier
7. __Secure-3PSID  - Secure session
8. APISID          - API session ID
9. __Secure-3PSIDCC - Session security check (expires first)
10. SIDCC          - Session check
```

### 4. Browser-Specific Tips

#### Chrome/Edge
1. Sign into Chrome/Edge with your Google account
2. Enable sync for passwords and cookies
3. Use the same profile consistently
4. Don't clear cookies for *.youtube.com

#### Firefox
1. Set Enhanced Tracking Protection to "Standard" (not Strict)
2. Add music.youtube.com to exceptions
3. Don't use "Delete cookies on close" setting

#### Safari
1. Disable "Prevent cross-site tracking" for YouTube
2. Don't use "Private Browsing"

### 5. Advanced: OAuth Token Method (Alternative)

For truly long-lasting access (weeks/months), consider:
1. Using OAuth 2.0 flow instead of cookies (requires different implementation)
2. Using Google account application-specific passwords
3. Using service account credentials (for organization accounts)

## Signs Your Cookies Are About to Expire

Watch for these warning signs:
- Search still works but playlist operations fail
- 401 errors start appearing
- "Precondition check failed" errors
- Playlist creation succeeds but adding songs fails

## Refresh Strategy

### Proactive Refresh (Recommended)
- Set a calendar reminder every 10-14 days
- Refresh cookies before they expire
- Keep a backup of working cookies

### Quick Refresh Process
1. Open [music.youtube.com](https://music.youtube.com)
2. If signed out, sign in with "Stay signed in" checked
3. If signed in, sign out and back in with "Stay signed in"
4. Open Console (F12) and run:
   ```javascript
   copy(document.cookie)
   ```
5. Update your MCP server configuration immediately

## Cookie Monitoring Script

You can check your cookie expiration with this script in the browser console:

```javascript
// Run this on music.youtube.com
document.cookie.split('; ').forEach(c => {
    const [name, value] = c.split('=');
    if (['SAPISID', 'LOGIN_INFO', 'SIDCC', '__Secure-3PSIDCC'].includes(name)) {
        console.log(`${name}: ${value.length > 20 ? 'Present' : value}`);
    }
});

// Check if critical cookies exist
const critical = ['SAPISID', 'HSID', 'SSID', 'SID'];
const missing = critical.filter(name => 
    !document.cookie.includes(name + '=')
);
if (missing.length > 0) {
    console.warn('Missing critical cookies:', missing);
    console.log('Try signing out and back in with "Stay signed in" checked');
}
```

## Why Not Use API Keys?

YouTube Music doesn't offer public API keys because:
- It's a paid/subscription service
- Google wants to control third-party access
- The official API (YouTube Data API) doesn't support Music-specific features
- OAuth implementation would require app registration and approval

## Summary

**For maximum cookie lifespan**:
1. Always check "Stay signed in" when logging in
2. Use your main browser profile
3. Extract ALL required cookies
4. Refresh every 10-14 days proactively
5. Monitor for early warning signs of expiration

With these practices, cookies can last 2-4 weeks instead of 2 hours.