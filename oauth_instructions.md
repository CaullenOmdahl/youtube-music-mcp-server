# YouTube Music OAuth Setup Instructions

## Your Authentication URL:
**https://www.google.com/device?user_code=TGS-VSZ-LNT**

## Steps to Complete OAuth Setup:

1. **Visit the URL above** in your browser
2. **Enter the code**: `TGS-VSZ-LNT`
3. **Sign in** with your Google account (the one you use for YouTube Music)
4. **Grant permissions** to the application
5. **After approval**, run this command:

```bash
cd /home/caullen/Documents/github/YTMusicPlugin
echo "" | python -c "
import json
from ytmusicapi import setup_oauth

with open('oauth.json', 'r') as f:
    oauth_data = json.load(f)

client_id = oauth_data['installed']['client_id']
client_secret = oauth_data['installed']['client_secret']

setup_oauth(filepath='browser.json', client_id=client_id, client_secret=client_secret)
print('OAuth setup completed!')
"
```

This will create a `browser.json` file with your refresh tokens.

## Alternative: Interactive Setup

If the above doesn't work, run this interactive command and follow the prompts:

```bash
cd /home/caullen/Documents/github/YTMusicPlugin
ytmusicapi oauth --client-id "YOUR_CLIENT_ID" --client-secret "YOUR_CLIENT_SECRET"
```

After OAuth setup is complete, the server will automatically use the `browser.json` file for authentication instead of the expiring headers.