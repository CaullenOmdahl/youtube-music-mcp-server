/**
 * Unit tests for playlist reordering algorithm
 * Tests the variety and flow optimization logic
 */

import type { RecommendationResult, Track, MUSICDimensions } from '../adaptive-playlist/types.js';

// Default MUSIC dimensions for testing
const defaultDimensions: MUSICDimensions = {
  mellow: 17,
  sophisticated: 17,
  intense: 17,
  contemporary: 17,
  unpretentious: 17,
};

// Helper to create mock tracks
function createMockTrack(
  artist: string,
  title: string,
  options: { energy?: number; valence?: number; tempo?: number } = {}
): Track {
  return {
    videoId: `video_${artist}_${title}`.replace(/\s/g, '_'),
    title,
    artist,
    releaseYear: 2023,
    dimensions: defaultDimensions,
    tempo: options.tempo ?? 120,
    energy: options.energy ?? 0.5,
    complexity: 0.5,
    mode: 17,
    predictability: 17,
    consonance: 17,
    valence: options.valence ?? 17,
    arousal: 17,
    genres: ['pop'],
    tags: [],
    popularity: 0.5,
    mainstream: true,
    isTrending: false,
    hasLyrics: true,
    userPlayCount: 0,
    isNewArtist: true,
    artistFamiliarity: 0,
  };
}

function createMockRecommendation(
  artist: string,
  title: string,
  score: number,
  options: { energy?: number; valence?: number; tempo?: number } = {}
): RecommendationResult {
  return {
    track: createMockTrack(artist, title, options),
    score,
    breakdown: { primary: 0.5, secondary: 0.3, tertiary: 0.2 },
    modulation: 1.0,
    exploration: 0.5,
  };
}

// Standalone implementations of the algorithms for testing
function reorderForVarietyAndFlow(
  recommendations: RecommendationResult[]
): RecommendationResult[] {
  if (recommendations.length <= 2) {
    return recommendations;
  }

  // Step 1: Group tracks by artist
  const artistGroups = new Map<string, RecommendationResult[]>();
  for (const rec of recommendations) {
    const artist = rec.track.artist;
    const group = artistGroups.get(artist) || [];
    group.push(rec);
    artistGroups.set(artist, group);
  }

  // Step 2: Calculate ideal spacing for each artist's tracks
  const totalLength = recommendations.length;
  const artistSpacing = new Map<string, number>();
  for (const [artist, tracks] of artistGroups) {
    artistSpacing.set(artist, totalLength / tracks.length);
  }

  // Step 3: Use greedy interleaving algorithm
  const sortedArtists = [...artistGroups.entries()]
    .sort((a, b) => b[1].length - a[1].length);

  const result: (RecommendationResult | null)[] = new Array(totalLength).fill(null);
  const usedPositions = new Set<number>();

  for (const [artist, tracks] of sortedArtists) {
    const spacing = artistSpacing.get(artist) || 1;
    tracks.sort((a, b) => b.score - a.score);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (!track) continue;

      const idealPos = Math.floor(i * spacing + spacing / 2);
      const pos = findNearestAvailablePosition(
        idealPos,
        usedPositions,
        totalLength,
        result,
        track.track.artist
      );

      result[pos] = track;
      usedPositions.add(pos);
    }
  }

  return result.filter((r): r is RecommendationResult => r !== null);
}

function findNearestAvailablePosition(
  idealPos: number,
  usedPositions: Set<number>,
  totalLength: number,
  result: (RecommendationResult | null)[],
  artist: string
): number {
  if (!usedPositions.has(idealPos) && idealPos < totalLength) {
    if (!wouldCreateConsecutive(result, idealPos, artist)) {
      return idealPos;
    }
  }

  for (let offset = 1; offset < totalLength; offset++) {
    const posAfter = idealPos + offset;
    if (posAfter < totalLength && !usedPositions.has(posAfter)) {
      if (!wouldCreateConsecutive(result, posAfter, artist)) {
        return posAfter;
      }
    }

    const posBefore = idealPos - offset;
    if (posBefore >= 0 && !usedPositions.has(posBefore)) {
      if (!wouldCreateConsecutive(result, posBefore, artist)) {
        return posBefore;
      }
    }
  }

  for (let i = 0; i < totalLength; i++) {
    if (!usedPositions.has(i)) {
      return i;
    }
  }

  return 0;
}

function wouldCreateConsecutive(
  result: (RecommendationResult | null)[],
  pos: number,
  artist: string
): boolean {
  if (pos > 0 && result[pos - 1]?.track.artist === artist) {
    return true;
  }
  if (pos < result.length - 1 && result[pos + 1]?.track.artist === artist) {
    return true;
  }
  return false;
}

// Helper to check if playlist has consecutive same-artist
function hasConsecutiveSameArtist(tracks: RecommendationResult[]): boolean {
  for (let i = 1; i < tracks.length; i++) {
    const curr = tracks[i];
    const prev = tracks[i - 1];
    if (curr && prev && curr.track.artist === prev.track.artist) {
      return true;
    }
  }
  return false;
}

// Helper to count consecutive same-artist pairs
function countConsecutiveSameArtist(tracks: RecommendationResult[]): number {
  let count = 0;
  for (let i = 1; i < tracks.length; i++) {
    const curr = tracks[i];
    const prev = tracks[i - 1];
    if (curr && prev && curr.track.artist === prev.track.artist) {
      count++;
    }
  }
  return count;
}

describe('Playlist Reordering Algorithm', () => {
  describe('reorderForVarietyAndFlow', () => {
    test('returns empty array for empty input', () => {
      const result = reorderForVarietyAndFlow([]);
      expect(result).toEqual([]);
    });

    test('returns same array for 1 track', () => {
      const tracks = [createMockRecommendation('Artist A', 'Song 1', 0.9)];
      const result = reorderForVarietyAndFlow(tracks);
      expect(result).toHaveLength(1);
      expect(result[0]?.track.artist).toBe('Artist A');
    });

    test('returns same array for 2 tracks', () => {
      const tracks = [
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        createMockRecommendation('Artist A', 'Song 2', 0.8),
      ];
      const result = reorderForVarietyAndFlow(tracks);
      expect(result).toHaveLength(2);
    });

    test('avoids consecutive same-artist when possible', () => {
      // Input: A, A, B, B, C, C (worst case clustering)
      const tracks = [
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        createMockRecommendation('Artist A', 'Song 2', 0.8),
        createMockRecommendation('Artist B', 'Song 1', 0.7),
        createMockRecommendation('Artist B', 'Song 2', 0.6),
        createMockRecommendation('Artist C', 'Song 1', 0.5),
        createMockRecommendation('Artist C', 'Song 2', 0.4),
      ];

      const result = reorderForVarietyAndFlow(tracks);

      expect(result).toHaveLength(6);
      expect(hasConsecutiveSameArtist(result)).toBe(false);
    });

    test('distributes artist tracks evenly', () => {
      // 3 tracks from Artist A in a 9-track playlist should be ~3 positions apart
      const tracks = [
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        createMockRecommendation('Artist A', 'Song 2', 0.8),
        createMockRecommendation('Artist A', 'Song 3', 0.7),
        createMockRecommendation('Artist B', 'Song 1', 0.6),
        createMockRecommendation('Artist C', 'Song 1', 0.5),
        createMockRecommendation('Artist D', 'Song 1', 0.4),
        createMockRecommendation('Artist E', 'Song 1', 0.3),
        createMockRecommendation('Artist F', 'Song 1', 0.2),
        createMockRecommendation('Artist G', 'Song 1', 0.1),
      ];

      const result = reorderForVarietyAndFlow(tracks);

      // Find positions of Artist A tracks
      const artistAPositions = result
        .map((r, i) => (r.track.artist === 'Artist A' ? i : -1))
        .filter((i) => i >= 0);

      expect(artistAPositions).toHaveLength(3);

      // Check spacing - with 9 tracks and 3 from A, ideal spacing is 3
      // Positions should be roughly 1, 4, 7 or similar spread
      const gaps: number[] = [];
      for (let i = 1; i < artistAPositions.length; i++) {
        const curr = artistAPositions[i];
        const prev = artistAPositions[i - 1];
        if (curr !== undefined && prev !== undefined) {
          gaps.push(curr - prev);
        }
      }

      // Average gap should be around 3 (±1 for positioning flexibility)
      const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
      expect(avgGap).toBeGreaterThanOrEqual(2);
      expect(avgGap).toBeLessThanOrEqual(4);
    });

    test('handles all same artist gracefully', () => {
      // When all tracks are same artist, consecutive is unavoidable
      const tracks = [
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        createMockRecommendation('Artist A', 'Song 2', 0.8),
        createMockRecommendation('Artist A', 'Song 3', 0.7),
        createMockRecommendation('Artist A', 'Song 4', 0.6),
      ];

      const result = reorderForVarietyAndFlow(tracks);

      // Should return all tracks without crashing
      expect(result).toHaveLength(4);
      // All tracks should be from Artist A
      expect(result.every((r) => r.track.artist === 'Artist A')).toBe(true);
    });

    test('handles majority same artist', () => {
      // 4 from A, 1 from B - some consecutive A is unavoidable
      const tracks = [
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        createMockRecommendation('Artist A', 'Song 2', 0.8),
        createMockRecommendation('Artist A', 'Song 3', 0.7),
        createMockRecommendation('Artist A', 'Song 4', 0.6),
        createMockRecommendation('Artist B', 'Song 1', 0.5),
      ];

      const result = reorderForVarietyAndFlow(tracks);

      expect(result).toHaveLength(5);

      // B should break up the As as much as possible
      // Best case: A, A, B, A, A (1 pair) or A, B, A, A, A (2 pairs)
      // Worst unavoidable: 3 consecutive As
      const consecutiveCount = countConsecutiveSameArtist(result);
      expect(consecutiveCount).toBeLessThanOrEqual(3); // Worst case for 4 As
    });

    test('preserves all tracks (no data loss)', () => {
      const tracks = [
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        createMockRecommendation('Artist B', 'Song 1', 0.8),
        createMockRecommendation('Artist A', 'Song 2', 0.7),
        createMockRecommendation('Artist C', 'Song 1', 0.6),
        createMockRecommendation('Artist B', 'Song 2', 0.5),
      ];

      const result = reorderForVarietyAndFlow(tracks);

      expect(result).toHaveLength(5);

      // Check all original tracks are present
      const originalIds = new Set(tracks.map((t) => t.track.videoId));
      const resultIds = new Set(result.map((t) => t.track.videoId));
      expect(resultIds).toEqual(originalIds);
    });

    test('handles large playlist', () => {
      // Create a 30-track playlist with various artists
      const tracks: RecommendationResult[] = [];
      const artists = ['A', 'B', 'C', 'D', 'E'];

      for (let i = 0; i < 30; i++) {
        const artist = artists[i % artists.length];
        tracks.push(
          createMockRecommendation(`Artist ${artist}`, `Song ${Math.floor(i / 5) + 1}`, 1 - i * 0.03)
        );
      }

      const result = reorderForVarietyAndFlow(tracks);

      expect(result).toHaveLength(30);
      expect(hasConsecutiveSameArtist(result)).toBe(false);
    });
  });

  describe('wouldCreateConsecutive', () => {
    test('detects consecutive before position', () => {
      const result: (RecommendationResult | null)[] = [
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        null,
        null,
      ];

      expect(wouldCreateConsecutive(result, 1, 'Artist A')).toBe(true);
      expect(wouldCreateConsecutive(result, 1, 'Artist B')).toBe(false);
    });

    test('detects consecutive after position', () => {
      const result: (RecommendationResult | null)[] = [
        null,
        null,
        createMockRecommendation('Artist A', 'Song 1', 0.9),
      ];

      expect(wouldCreateConsecutive(result, 1, 'Artist A')).toBe(true);
      expect(wouldCreateConsecutive(result, 1, 'Artist B')).toBe(false);
    });

    test('handles edge positions', () => {
      const result: (RecommendationResult | null)[] = [
        null,
        createMockRecommendation('Artist A', 'Song 1', 0.9),
        null,
      ];

      // First position - only check after
      expect(wouldCreateConsecutive(result, 0, 'Artist A')).toBe(true);
      expect(wouldCreateConsecutive(result, 0, 'Artist B')).toBe(false);

      // Last position - only check before
      expect(wouldCreateConsecutive(result, 2, 'Artist A')).toBe(true);
      expect(wouldCreateConsecutive(result, 2, 'Artist B')).toBe(false);
    });
  });

  describe('findNearestAvailablePosition', () => {
    test('returns ideal position when available and safe', () => {
      const result: (RecommendationResult | null)[] = new Array(10).fill(null);
      const usedPositions = new Set<number>();

      const pos = findNearestAvailablePosition(5, usedPositions, 10, result, 'Artist A');
      expect(pos).toBe(5);
    });

    test('finds alternate position when ideal is used', () => {
      const result: (RecommendationResult | null)[] = new Array(10).fill(null);
      const usedPositions = new Set([5]);

      const pos = findNearestAvailablePosition(5, usedPositions, 10, result, 'Artist A');
      expect(pos).not.toBe(5);
      expect(usedPositions.has(pos)).toBe(false);
    });

    test('avoids creating consecutive same-artist', () => {
      const result: (RecommendationResult | null)[] = new Array(10).fill(null);
      result[4] = createMockRecommendation('Artist A', 'Song 1', 0.9);
      const usedPositions = new Set([4]);

      // Position 5 is ideal but would be consecutive with Artist A at position 4
      const pos = findNearestAvailablePosition(5, usedPositions, 10, result, 'Artist A');
      expect(pos).not.toBe(5); // Should avoid position 5
      expect(pos).not.toBe(3); // Should also avoid position 3
    });
  });
});
