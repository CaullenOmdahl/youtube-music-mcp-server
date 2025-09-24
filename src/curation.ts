import { YouTubeMusicClient } from "./youtube-music-client.js";
import { Song } from "./types.js";

interface CurationOptions {
  durationMinutes?: number;
  includeExplicit?: boolean;
  mood?: 'energetic' | 'chill' | 'focus' | 'party' | 'workout' | 'sleep';
  decade?: number;
}

interface PlaylistSuggestion {
  title: string;
  description: string;
  songs: Song[];
  reasoning: string;
}

export class PlaylistCurator {
  private ytmusicClient: YouTubeMusicClient;

  constructor(ytmusicClient: YouTubeMusicClient) {
    this.ytmusicClient = ytmusicClient;
  }

  async generatePlaylistSuggestions(
    seedSongs?: Song[],
    _seedArtists?: string[],
    options: CurationOptions = {}
  ): Promise<PlaylistSuggestion[]> {
    const suggestions: PlaylistSuggestion[] = [];

    try {
      // If we have seed songs, analyze them for suggestions
      if (seedSongs && seedSongs.length > 0) {
        const artistBasedSuggestion = await this.createArtistBasedPlaylist(seedSongs, options);
        if (artistBasedSuggestion) {
          suggestions.push(artistBasedSuggestion);
        }

        const genreBasedSuggestion = await this.createGenreBasedPlaylist(seedSongs, options);
        if (genreBasedSuggestion) {
          suggestions.push(genreBasedSuggestion);
        }
      }

      // Generate mood-based playlists
      if (options.mood) {
        const moodBasedSuggestion = await this.createMoodBasedPlaylist(options.mood, options);
        if (moodBasedSuggestion) {
          suggestions.push(moodBasedSuggestion);
        }
      }

      // Generate decade-based playlists
      if (options.decade) {
        const decadeBasedSuggestion = await this.createDecadeBasedPlaylist(options.decade, options);
        if (decadeBasedSuggestion) {
          suggestions.push(decadeBasedSuggestion);
        }
      }

      return suggestions;
    } catch (error) {
      console.error('Error generating playlist suggestions:', error);
      return [];
    }
  }

  private async createArtistBasedPlaylist(seedSongs: Song[], options: CurationOptions): Promise<PlaylistSuggestion | null> {
    try {
      // Extract artists from seed songs
      const artists = new Set<string>();
      seedSongs.forEach(song => {
        song.artists?.forEach(artist => artists.add(artist.name));
      });

      const artistList = Array.from(artists).slice(0, 5); // Limit to top 5 artists

      // Search for more songs by these artists
      const allSongs = [...seedSongs];

      for (const artist of artistList) {
        const searchResults = await this.ytmusicClient.search({
          query: artist,
          type: 'songs',
          limit: 10
        });

        if (searchResults.songs) {
          // Filter to songs actually by this artist and not already included
          const artistSongs = searchResults.songs.filter(song =>
            song.artists?.some(a => a.name.toLowerCase().includes(artist.toLowerCase())) &&
            !allSongs.some(existing => existing.videoId === song.videoId)
          );

          allSongs.push(...artistSongs.slice(0, 5));
        }
      }

      // Apply filters
      const filteredSongs = this.applyCurationFilters(allSongs, options);

      return {
        title: `Similar Artists Mix`,
        description: `A curated playlist featuring ${artistList.join(', ')} and similar artists`,
        songs: this.shuffleAndLimit(filteredSongs, options.durationMinutes),
        reasoning: `Based on your preference for ${artistList.slice(0, 2).join(' and ')}, this playlist includes more tracks from these artists and similar music.`
      };
    } catch (error) {
      console.error('Error creating artist-based playlist:', error);
      return null;
    }
  }

  private async createGenreBasedPlaylist(seedSongs: Song[], options: CurationOptions): Promise<PlaylistSuggestion | null> {
    try {
      // For now, use a simple approach since we don't have explicit genre data
      // In a real implementation, you might use external services or analyze song metadata
      const genreKeywords = this.extractGenreKeywords(seedSongs);

      if (genreKeywords.length === 0) {
        return null;
      }

      const allSongs: Song[] = [];

      for (const keyword of genreKeywords.slice(0, 3)) {
        const searchResults = await this.ytmusicClient.search({
          query: keyword,
          type: 'songs',
          limit: 15
        });

        if (searchResults.songs) {
          allSongs.push(...searchResults.songs);
        }
      }

      const filteredSongs = this.applyCurationFilters(allSongs, options);
      const uniqueSongs = this.removeDuplicates(filteredSongs);

      return {
        title: `Genre Mix: ${genreKeywords[0]}`,
        description: `A collection of ${genreKeywords[0]} tracks and similar genres`,
        songs: this.shuffleAndLimit(uniqueSongs, options.durationMinutes),
        reasoning: `This playlist explores the ${genreKeywords[0]} genre based on patterns in your seed tracks.`
      };
    } catch (error) {
      console.error('Error creating genre-based playlist:', error);
      return null;
    }
  }

  private async createMoodBasedPlaylist(mood: string, options: CurationOptions): Promise<PlaylistSuggestion | null> {
    const moodQueries: Record<string, string[]> = {
      energetic: ['high energy', 'upbeat', 'pump up', 'motivation', 'workout'],
      chill: ['chill', 'relax', 'ambient', 'lo-fi', 'calm'],
      focus: ['instrumental', 'ambient', 'focus music', 'study music', 'concentration'],
      party: ['party', 'dance', 'club', 'celebration', 'fun'],
      workout: ['workout', 'gym', 'fitness', 'running', 'cardio'],
      sleep: ['sleep', 'peaceful', 'soft', 'lullaby', 'bedtime']
    };

    const queries = moodQueries[mood];
    if (!queries) return null;

    try {
      const allSongs: Song[] = [];

      for (const query of queries.slice(0, 3)) {
        const searchResults = await this.ytmusicClient.search({
          query,
          type: 'songs',
          limit: 12
        });

        if (searchResults.songs) {
          allSongs.push(...searchResults.songs);
        }
      }

      const filteredSongs = this.applyCurationFilters(allSongs, options);
      const uniqueSongs = this.removeDuplicates(filteredSongs);

      return {
        title: `${mood.charAt(0).toUpperCase() + mood.slice(1)} Vibes`,
        description: `Perfect tracks for a ${mood} mood`,
        songs: this.shuffleAndLimit(uniqueSongs, options.durationMinutes),
        reasoning: `This playlist is specifically curated for ${mood} moments, featuring tracks that match this mood perfectly.`
      };
    } catch (error) {
      console.error('Error creating mood-based playlist:', error);
      return null;
    }
  }

  private async createDecadeBasedPlaylist(decade: number, options: CurationOptions): Promise<PlaylistSuggestion | null> {
    try {
      const decadeQueries = [
        `${decade}s hits`,
        `${decade}s music`,
        `${decade}s classics`,
        `best of ${decade}s`
      ];

      const allSongs: Song[] = [];

      for (const query of decadeQueries.slice(0, 2)) {
        const searchResults = await this.ytmusicClient.search({
          query,
          type: 'songs',
          limit: 15
        });

        if (searchResults.songs) {
          // Filter by actual year if available
          const decadeSongs = searchResults.songs.filter(song =>
            !song.year || (song.year >= decade && song.year < decade + 10)
          );
          allSongs.push(...decadeSongs);
        }
      }

      const filteredSongs = this.applyCurationFilters(allSongs, options);
      const uniqueSongs = this.removeDuplicates(filteredSongs);

      return {
        title: `${decade}s Throwback`,
        description: `Classic hits and memorable tracks from the ${decade}s`,
        songs: this.shuffleAndLimit(uniqueSongs, options.durationMinutes),
        reasoning: `A nostalgic journey through the best music of the ${decade}s.`
      };
    } catch (error) {
      console.error('Error creating decade-based playlist:', error);
      return null;
    }
  }

  private applyCurationFilters(songs: Song[], options: CurationOptions): Song[] {
    let filtered = [...songs];

    // Filter explicit content if requested
    if (options.includeExplicit === false) {
      filtered = filtered.filter(song => !song.isExplicit);
    }

    // TODO: Add more sophisticated filtering based on other options
    // This could include tempo analysis, energy level detection, etc.

    return filtered;
  }

  private extractGenreKeywords(_songs: Song[]): string[] {
    // Simple keyword extraction based on common patterns
    // In a real implementation, this would be much more sophisticated
    // You could analyze song titles, artist names, etc. for genre hints
    // For now, return some common genre terms
    return ['pop', 'rock', 'hip hop', 'electronic', 'indie'];
  }

  private removeDuplicates(songs: Song[]): Song[] {
    const seen = new Set<string>();
    return songs.filter(song => {
      if (seen.has(song.videoId)) {
        return false;
      }
      seen.add(song.videoId);
      return true;
    });
  }

  private shuffleAndLimit(songs: Song[], durationMinutes?: number): Song[] {
    // Shuffle the array
    const shuffled = [...songs].sort(() => Math.random() - 0.5);

    if (!durationMinutes) {
      // Default to 30 songs if no duration specified
      return shuffled.slice(0, 30);
    }

    // Try to get songs that fit within the duration
    const targetSeconds = durationMinutes * 60;
    let currentSeconds = 0;
    const result: Song[] = [];

    for (const song of shuffled) {
      if (song.duration) {
        const parts = song.duration.split(':').map(Number);
        if (parts.length === 2) {
          const songSeconds = parts[0] * 60 + parts[1];
          if (currentSeconds + songSeconds > targetSeconds && result.length > 5) {
            break; // Don't add if it would exceed duration and we have enough songs
          }
          currentSeconds += songSeconds;
        }
      }

      result.push(song);

      // Safety limit
      if (result.length >= 100) break;
    }

    return result;
  }

  async createSmartPlaylist(description: string, targetLength = 25): Promise<PlaylistSuggestion | null> {
    // Parse natural language description for intent
    const lowerDesc = description.toLowerCase();
    const options: CurationOptions = {};

    // Detect mood
    if (lowerDesc.includes('workout') || lowerDesc.includes('gym') || lowerDesc.includes('exercise')) {
      options.mood = 'workout';
    } else if (lowerDesc.includes('chill') || lowerDesc.includes('relax') || lowerDesc.includes('calm')) {
      options.mood = 'chill';
    } else if (lowerDesc.includes('party') || lowerDesc.includes('dance') || lowerDesc.includes('club')) {
      options.mood = 'party';
    } else if (lowerDesc.includes('focus') || lowerDesc.includes('study') || lowerDesc.includes('concentration')) {
      options.mood = 'focus';
    } else if (lowerDesc.includes('sleep') || lowerDesc.includes('bedtime')) {
      options.mood = 'sleep';
    } else if (lowerDesc.includes('energy') || lowerDesc.includes('upbeat')) {
      options.mood = 'energetic';
    }

    // Detect decade
    const decades = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
    for (const decade of decades) {
      if (lowerDesc.includes(decade.toString()) || lowerDesc.includes(`${decade}s`)) {
        options.decade = decade;
        break;
      }
    }

    if (options.mood || options.decade) {
      const suggestions = await this.generatePlaylistSuggestions(undefined, undefined, options);
      if (suggestions.length > 0) {
        const suggestion = suggestions[0];
        return {
          ...suggestion,
          title: this.generateSmartTitle(description),
          description: `Curated based on: "${description}"`,
          songs: suggestion.songs.slice(0, targetLength)
        };
      }
    }

    return null;
  }

  private generateSmartTitle(description: string): string {
    const words = description.split(' ').filter(w => w.length > 2);
    const titleWords = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1));
    return titleWords.join(' ') + ' Mix';
  }
}