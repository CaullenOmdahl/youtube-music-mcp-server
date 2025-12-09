# Playlist Creation Guidelines for LLMs

This document provides guidance for AI assistants using the YouTube Music MCP server tools to create high-quality playlists. **These guidelines apply whether using the adaptive playlist flow OR manually adding songs via `add_songs_to_playlist`.**

## Core Principle: Variety Over Clustering

Research shows that listeners perceive playlists as "random" and enjoyable when songs from the same artist are **distributed evenly throughout**, not clustered together. A playlist with 3 Taylor Swift songs should have them spread across the beginning, middle, and end - not consecutively.

## The Golden Rules

### 1. Never Add Consecutive Same-Artist Songs

**Bad:**
```
1. Artist A - Song 1
2. Artist A - Song 2  <- BAD: Same artist back-to-back
3. Artist A - Song 3  <- BAD: Still same artist
4. Artist B - Song 1
```

**Good:**
```
1. Artist A - Song 1
2. Artist B - Song 1
3. Artist C - Song 1
4. Artist A - Song 2  <- Good: Artist A returns after gap
5. Artist D - Song 1
6. Artist A - Song 3  <- Good: Distributed throughout
```

### 2. Calculate Ideal Spacing

If you're adding N songs from one artist to a playlist of L total songs:
- **Ideal spacing** = L / N positions between that artist's songs
- Example: 30-song playlist with 3 Artist A songs = space them ~10 songs apart

### 3. Avoid Same-Album Clustering

When adding multiple songs from the same album, treat them similarly to same-artist songs - distribute them throughout the playlist rather than grouping them.

### 4. Smooth Transitions

Consider the **flow** between adjacent songs:
- **Energy**: Don't jump from very calm to very intense (unless intentional)
- **Tempo**: Gradual BPM changes feel more natural
- **Mood**: Match valence (happiness) between adjacent tracks when possible

## Manual Playlist Building Checklist

When using `search_songs` + `add_songs_to_playlist` manually:

1. **Gather all songs first** before adding them
2. **Group by artist** to see how many songs per artist you have
3. **Plan positions** - calculate where each artist's songs should go
4. **Reorder the list** to distribute same-artist songs evenly
5. **Check transitions** - ensure no jarring energy/tempo jumps
6. **Add songs in the final order** to the playlist

## Example: Building a 20-Song Playlist

**User request:** "Create a workout playlist with songs from Dua Lipa, The Weeknd, and Daft Punk"

**Step 1: Search and collect songs**
- Dua Lipa: 4 songs found
- The Weeknd: 4 songs found
- Daft Punk: 3 songs found
- Other artists to fill: 9 songs

**Step 2: Calculate spacing**
- Dua Lipa (4 songs in 20): every 5 positions
- The Weeknd (4 songs in 20): every 5 positions
- Daft Punk (3 songs in 20): every ~7 positions

**Step 3: Distribute and interleave**
```
1.  Other Artist
2.  Dua Lipa #1
3.  Other Artist
4.  The Weeknd #1
5.  Other Artist
6.  Daft Punk #1
7.  Dua Lipa #2
8.  Other Artist
9.  The Weeknd #2
10. Other Artist
11. Other Artist
12. Dua Lipa #3
13. Daft Punk #2
14. The Weeknd #3
15. Other Artist
16. Other Artist
17. Dua Lipa #4
18. Other Artist
19. Daft Punk #3
20. The Weeknd #4
```

## Using the Adaptive Playlist Tools

The `generate_adaptive_playlist` tool **automatically handles reordering** using research-backed algorithms. When possible, prefer this flow:

1. `start_playlist_conversation` - Begin conversational session
2. `continue_conversation` - Gather user preferences
3. `generate_adaptive_playlist` - Creates properly ordered playlist

The recommendation engine will:
- Limit songs per artist based on discovery preferences
- Distribute same-artist songs evenly (van Asseldonk algorithm)
- Smooth transitions by minimizing energy/tempo jumps
- Only place same-artist consecutively when mathematically unavoidable

## Research References

These guidelines are based on:

1. **Van Asseldonk Shuffle Algorithm** - Mathematical proof that distributing artists evenly creates optimal "perceived randomness"
   - https://ruudvanasseldonk.com/2023/an-algorithm-for-shuffling-playlists

2. **EPJ Data Science 2025** - Formal definition of playlist coherence using sequential variance
   - Coherence = 1 - (sequential_variance / population_variance)
   - Uses 9 audio features: energy, valence, tempo, danceability, etc.

3. **Spotify's Shuffle Algorithm** - Temporal awareness to prevent clustering
   - Tracks recent playback to adjust selection probabilities
   - "Fewer Repeats" mode as default shuffle

4. **Professional DJ Techniques** - "Always stagger artists, avoiding back-to-back repeats"

## Quick Reference

| Playlist Size | Max Same-Artist Consecutive | Ideal Spacing for 3 Songs |
|---------------|-----------------------------|-----------------------------|
| 10 songs      | 1 (avoid if possible)       | Every 3-4 songs            |
| 20 songs      | 1                           | Every 6-7 songs            |
| 30 songs      | 1                           | Every 10 songs             |
| 50 songs      | 1-2 only if unavoidable     | Every 16-17 songs          |

## Summary

**When creating playlists manually:**
1. Collect all songs first
2. Calculate ideal spacing per artist
3. Distribute songs evenly - never same artist back-to-back
4. Consider energy/tempo flow between adjacent tracks
5. Add songs in the reordered sequence

**When using adaptive playlist tools:**
- The system handles this automatically
- Trust the reordering algorithm
- Focus on gathering good preference data in the conversation
