# Database Setup Guide

## Overview

The AI-Guided Adaptive Playlist system requires a PostgreSQL database. This guide walks you through completing the setup.

## Current Status

✅ **Completed:**
- PostgreSQL database created on Railway
- Database configuration added to code
- Database client with connection pooling
- Auto-migration on server startup
- Health check endpoint includes database status
- Graceful fallback if DATABASE_URL not configured

⏳ **Remaining Steps:**
1. Link the database to your service in Railway
2. Get the DATABASE_URL and add it to Railway environment variables
3. Deploy to Railway to initialize the database schema

---

## Step-by-Step Instructions

### 1. Link Database to Service (Railway Dashboard)

1. Go to your Railway project: https://railway.app/project/d18fb84b-f089-41b0-a44b-b2479e7fb192
2. You should see two services:
   - `youtube-music-mcp-server` (your main service)
   - `postgres` (the database you just created)
3. Click on your `youtube-music-mcp-server` service
4. Go to the **Variables** tab
5. Click **+ New Variable**
6. Add a **Reference Variable**:
   - Click "Add Reference"
   - Select the `postgres` service
   - Select `DATABASE_URL` from the dropdown
   - This will automatically link the database connection string

**Alternative:** Railway may have automatically created the `DATABASE_URL` variable when you added the database. Check your variables first!

### 2. Verify Database URL

Run this command to check if `DATABASE_URL` is now available:

```bash
railway variables | grep DATABASE_URL
```

You should see the connection string (it will be redacted for security).

### 3. Deploy to Railway

Deploy your code to Railway:

```bash
railway up
```

Or push to GitHub if you have auto-deploy enabled:

```bash
git add .
git commit -m "Add database configuration and adaptive playlist system"
git push
```

### 4. Monitor Deployment

Watch the deployment logs:

```bash
railway logs
```

Look for these success messages:
- `🔄 Initializing database...`
- `✅ Database schema initialized`
- `🔌 New database connection established`

### 5. Verify Database Health

Once deployed, check the health endpoint:

```bash
curl https://ytmusic.dumawtf.com/health
```

You should see:
```json
{
  "status": "healthy",
  "version": "3.0.0",
  "timestamp": "2025-01-21T...",
  "database": {
    "healthy": true,
    "totalConnections": 1,
    "idleConnections": 1,
    "waitingClients": 0
  }
}
```

---

## Database Schema

The database includes these tables:

### Core Tables:
- **`song_features`** - Shared song analysis (MusicBrainz + Spotify)
  - One entry per song for ALL users
  - Cached audio features, MUSIC dimensions, genres, tags
  - Lazy-loaded and automatically cleaned up

- **`user_listening_history`** - User-specific listening data
  - Tracks play counts and timestamps
  - Used for familiarity scoring

- **`user_profiles`** - User preference profiles
  - 37-character base-36 encoded profiles
  - MUSIC dimensions, mood preferences, discovery settings

- **`conversation_sessions`** - AI conversation state
  - Persists playlist creation conversations
  - Stores extracted profile information
  - Auto-expires after 7 days

- **`playlists`** - Generated adaptive playlists
  - Stores playlist metadata and encoded profiles
  - Links to YouTube Music playlist IDs

### Maintenance:
- Auto-cleanup functions for expired sessions and stale song features
- Materialized views for performance optimization
- Indexes on frequently queried columns

---

## Local Development (Optional)

To test locally without Railway:

### 1. Install PostgreSQL

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Linux
sudo apt-get install postgresql-16
sudo systemctl start postgresql
```

### 2. Create Local Database

```bash
createdb ytmusic
```

### 3. Add to .env

```bash
DATABASE_URL=postgresql://localhost/ytmusic
```

### 4. Run Server

```bash
npm run build
BYPASS_AUTH_FOR_TESTING=true PORT=8084 node dist/index.js
```

The database schema will be automatically created on startup.

---

## Configuration Options

Add these to your Railway environment variables or `.env`:

```bash
# Required
DATABASE_URL=postgresql://...

# Optional (defaults shown)
DATABASE_POOL_MIN=5      # Minimum connections in pool
DATABASE_POOL_MAX=20     # Maximum connections in pool
```

---

## Troubleshooting

### Database Not Connected

**Symptom:** Logs show `⚠️  DATABASE_URL not configured`

**Solution:** Verify the `DATABASE_URL` variable is set in Railway

### Migration Failed

**Symptom:** `❌ Database initialization failed`

**Solution:**
1. Check database credentials
2. Verify database is running in Railway
3. Check Railway logs for specific error

### Connection Pool Warnings

**Symptom:** `⚠️  Connection pool near capacity`

**Solution:** Increase `DATABASE_POOL_MAX` or investigate slow queries

### Slow Queries

**Symptom:** `🐌 Slow query (>1000ms)`

**Solution:** Check query logs and consider adding indexes

---

## What Happens Next

Once the database is configured:

1. **Server starts** → Runs database migration automatically
2. **Creates tables** → All 5 tables with indexes and functions
3. **Ready for use** → Adaptive playlist tools become functional

You can then use these MCP tools:
- `start_playlist_conversation` - Begin AI-guided playlist creation
- `continue_conversation` - Continue the conversation
- `generate_adaptive_playlist` - Create the playlist on YouTube Music
- `view_profile` - See user's music preference profile
- `decode_playlist_profile` - Decode profile from playlist description

---

## Next Steps

1. Complete the Railway dashboard steps above
2. Deploy your code
3. Test the adaptive playlist tools with Claude Desktop
4. Monitor logs and database health
5. Celebrate! 🎉
