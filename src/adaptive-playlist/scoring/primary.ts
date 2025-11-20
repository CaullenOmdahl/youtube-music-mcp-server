import type { Track, Profile, Context, MUSICDimensions, StyleProfile, ActivityProfile } from '../types.js';

/**
 * PRIMARY TIER SCORING (70% of total weight)
 * Components: Familiarity (30%) + Musical Features (25%) + Context (15%)
 */

// Activity profiles with constraints
const ACTIVITY_PROFILES: Record<number, ActivityProfile> = {
  1: {
    // Workout
    tempoMin: 120,
    tempoMax: 160,
    energyMin: 0.8,
    familiarityBoost: 1.2,
    discoveryWeight: 0.1,
    preferredDimensions: ['intense', 'contemporary'],
  },
  2: {
    // Focus/Study
    tempoMin: 60,
    tempoMax: 100,
    energyMax: 0.5,
    complexityMax: 0.4,
    instrumentalPreference: 0.8,
    familiarityBoost: 1.3,
    preferredDimensions: ['mellow', 'sophisticated'],
  },
  3: {
    // Relaxation
    tempoMin: 50,
    tempoMax: 85,
    energyMax: 0.3,
    familiarityBoost: 1.15,
    preferredDimensions: ['mellow'],
  },
  4: {
    // Social gathering
    tempoMin: 100,
    tempoMax: 130,
    energyMin: 0.6,
    familiarityBoost: 1.3,
    preferredDimensions: ['contemporary', 'unpretentious'],
  },
  5: {
    // Commute
    tempoMin: 90,
    tempoMax: 120,
    discoveryWeight: 0.3,
  },
  7: {
    // Active discovery
    discoveryWeight: 0.7,
    familiarityBoost: 0.7,
  },
};

/**
 * Calculate primary tier score (70% weight)
 */
export function calculatePrimaryScore(track: Track, profile: Profile, context: Context): number {
  const familiarity = calculateFamiliarityMatch(track, profile) * 0.3;
  const musicalFeatures = calculateMusicalFeaturesMatch(track, profile) * 0.25;
  const contextFit = calculateContextFit(track, context) * 0.15;

  return normalize(familiarity + musicalFeatures + contextFit);
}

/**
 * 1. Familiarity Match (30% of total)
 */
export function calculateFamiliarityMatch(track: Track, profile: Profile): number {
  const styleFamiliarity = calculateStyleFamiliarity(track, profile) * 0.7;
  const trackExposure = calculateTrackExposureScore(track, profile) * 0.2;
  const recency = calculateOptimalRecency(track, profile) * 0.1;

  return normalize(styleFamiliarity + trackExposure + recency);
}

function calculateStyleFamiliarity(track: Track, profile: Profile): number {
  // Extract user's familiar styles from profile
  const userStyles = profile.familiarStyles;

  if (!userStyles) {
    return 0.5; // Default for no data
  }

  // Calculate overlap between track's genres/tags and user's familiar styles
  const genreOverlap = calculateGenreOverlap(track.genres, userStyles);

  // Calculate MUSIC dimension proximity
  const dimensionSimilarity = calculateMUSICDimensionSimilarity(
    track.dimensions,
    profile.dimensions
  );

  // Combine: 60% genre overlap, 40% dimension similarity
  return normalize(genreOverlap * 0.6 + dimensionSimilarity * 0.4);
}

function calculateGenreOverlap(trackGenres: string[], userStyles: StyleProfile): number {
  if (trackGenres.length === 0 || userStyles.genres.length === 0) {
    return 0.5; // Default for no data
  }

  // Simple version: count matching genres
  const matches = trackGenres.filter((g) => userStyles.genres.includes(g)).length;
  const maxPossible = Math.max(trackGenres.length, userStyles.genres.length);
  return maxPossible > 0 ? matches / maxPossible : 0.5;
}

export function calculateMUSICDimensionSimilarity(
  trackDims: MUSICDimensions,
  profileDims: MUSICDimensions
): number {
  // Calculate average absolute difference across 5 MUSIC dimensions
  // All dimensions in range [0, 35]
  const differences = [
    Math.abs(trackDims.mellow - profileDims.mellow),
    Math.abs(trackDims.sophisticated - profileDims.sophisticated),
    Math.abs(trackDims.intense - profileDims.intense),
    Math.abs(trackDims.contemporary - profileDims.contemporary),
    Math.abs(trackDims.unpretentious - profileDims.unpretentious),
  ];

  const avgDifference = differences.reduce((a, b) => a + b, 0) / 5;

  // Convert to similarity score: 1.0 = identical, 0.0 = maximally different
  return 1 - avgDifference / 35;
}

function calculateTrackExposureScore(track: Track, profile: Profile): number {
  const playCount = track.userPlayCount || 0;

  // Sweet spot: 4-10 plays
  if (playCount === 0) {
    return 0.5; // Neutral for new tracks
  } else if (playCount < 4) {
    return 0.3; // Familiarization period
  } else if (playCount >= 4 && playCount <= 10) {
    return 1.0; // Optimal preference window
  } else if (playCount >= 11 && playCount <= 20) {
    return 0.9; // Still good, slight habituation
  } else {
    // Gradual habituation beyond 20
    let score = 0.7 - 0.01 * (playCount - 20);
    score = Math.max(score, 0.3); // Floor at 0.3

    // Complex music sustains interest longer
    if (track.complexity > 0.7) {
      score = Math.min(score * 1.2, 1.0);
    }

    return score;
  }
}

function calculateOptimalRecency(track: Track, profile: Profile): number {
  if (!track.lastPlayedDate) {
    return 1.0; // No penalty for never played
  }

  const daysSinceLast = daysBetween(track.lastPlayedDate, new Date());

  if (daysSinceLast < 0.125) {
    // <3 hours
    return 0.2; // Too soon
  } else if (daysSinceLast < 1) {
    // 3-24 hours
    return 0.6; // Still fresh
  } else if (daysSinceLast >= 1 && daysSinceLast <= 3) {
    // 1-3 days
    return 1.0; // Optimal spacing
  } else if (daysSinceLast > 3 && daysSinceLast <= 7) {
    return 0.9; // Good
  } else if (daysSinceLast > 7 && daysSinceLast <= 30) {
    return 0.8; // Spontaneous recovery period
  } else {
    return 0.7; // Nostalgic rediscovery potential
  }
}

/**
 * 2. Musical Features Match (25% of total)
 */
export function calculateMusicalFeaturesMatch(track: Track, profile: Profile): number {
  const musicDimensions = calculateMUSICDimensionsMatch(track, profile) * 0.48;
  const tempoEnergy = calculateTempoEnergyMatch(track, profile) * 0.2;
  const complexity = calculateComplexityMatch(track, profile) * 0.12;
  const mode = calculateModeMatch(track, profile) * 0.08;
  const predictability = calculatePredictabilityMatch(track, profile) * 0.08;
  const consonance = calculateConsonanceMatch(track, profile) * 0.04;

  return normalize(
    musicDimensions + tempoEnergy + complexity + mode + predictability + consonance
  );
}

function calculateMUSICDimensionsMatch(track: Track, profile: Profile): number {
  return calculateMUSICDimensionSimilarity(track.dimensions, profile.dimensions);
}

function calculateTempoEnergyMatch(track: Track, profile: Profile): number {
  // Context-aware tempo preference
  const preferredTempo = profile.tempo; // From encoded profile
  const tempoDiff = Math.abs(preferredTempo - track.tempo);

  let tempoScore: number;
  if (tempoDiff < 10) {
    tempoScore = 1.0;
  } else if (tempoDiff < 20) {
    tempoScore = 0.8;
  } else if (tempoDiff < 30) {
    tempoScore = 0.6;
  } else {
    tempoScore = 0.4;
  }

  // Energy match (if available)
  const energyScore =
    profile.energy !== undefined ? 1 - Math.abs(profile.energy - track.energy) : 0.7;

  return normalize(tempoScore * 0.6 + energyScore * 0.4);
}

function calculateComplexityMatch(track: Track, profile: Profile): number {
  const optimalComplexity = profile.complexity / 35; // Normalize to 0-1
  const complexityDiff = Math.abs(optimalComplexity - track.complexity);

  // Inverted-U curve: optimal match at user's preference level
  if (complexityDiff < 0.1) {
    return 1.0;
  } else if (complexityDiff < 0.2) {
    return 0.9;
  } else if (complexityDiff < 0.3) {
    return 0.7;
  } else {
    return Math.max(0.5 - complexityDiff, 0.1);
  }
}

function calculateModeMatch(track: Track, profile: Profile): number {
  // Mode: 0=minor, ~17.5=neutral, 35=major
  const modeDiff = Math.abs(profile.mode - track.mode) / 35;
  return 1 - modeDiff;
}

function calculatePredictabilityMatch(track: Track, profile: Profile): number {
  const predictabilityDiff = Math.abs(profile.predictability - track.predictability) / 35;
  return 1 - predictabilityDiff;
}

function calculateConsonanceMatch(track: Track, profile: Profile): number {
  const consonanceDiff = Math.abs(profile.consonance - track.consonance) / 35;
  return 1 - consonanceDiff;
}

/**
 * 3. Context Fit (15% of total)
 */
export function calculateContextFit(track: Track, context: Context): number {
  const activity = calculateActivityMatch(track, context) * 0.53;
  const social = calculateSocialContextMatch(track, context) * 0.2;
  const timeOfDay = calculateTimeOfDayMatch(track, context) * 0.13;
  const environment = calculateEnvironmentMatch(track, context) * 0.14;

  return normalize(activity + social + timeOfDay + environment);
}

function calculateActivityMatch(track: Track, context: Context): number {
  const activityProfile = ACTIVITY_PROFILES[context.activity];
  if (!activityProfile) return 0.8; // Neutral for unspecified

  let score = 1.0;

  // Check tempo constraints
  if (activityProfile.tempoMin && track.tempo < activityProfile.tempoMin) {
    score *= 0.5;
  }
  if (activityProfile.tempoMax && track.tempo > activityProfile.tempoMax) {
    score *= 0.5;
  }

  // Check energy constraints
  if (activityProfile.energyMin && track.energy < activityProfile.energyMin) {
    score *= 0.4;
  }
  if (activityProfile.energyMax && track.energy > activityProfile.energyMax) {
    score *= 0.6;
  }

  // Check complexity constraints
  if (activityProfile.complexityMax && track.complexity > activityProfile.complexityMax) {
    score *= 0.7;
  }

  return normalize(score);
}

function calculateSocialContextMatch(track: Track, context: Context): number {
  // 0=solo, ~17.5=mixed, 35=very social
  const socialLevel = context.socialFunction;

  if (socialLevel < 10) {
    // Solo
    return 1.0; // No constraints
  } else if (socialLevel >= 10 && socialLevel < 25) {
    // Small group
    return track.popularity > 0.4 ? 0.9 : 0.6;
  } else {
    // Party/large group
    return track.popularity > 0.7 ? 1.0 : 0.5;
  }
}

function calculateTimeOfDayMatch(track: Track, context: Context): number {
  if (context.timePattern > 23) return 0.9; // No time preference

  const hour = context.timePattern;
  let preferredEnergy: number;

  if (hour >= 5 && hour < 9) {
    preferredEnergy = 0.6; // Morning
  } else if (hour >= 9 && hour < 12) {
    preferredEnergy = 0.7; // Late morning
  } else if (hour >= 12 && hour < 17) {
    preferredEnergy = 0.6; // Afternoon
  } else if (hour >= 17 && hour < 21) {
    preferredEnergy = 0.5; // Evening
  } else if (hour >= 21 && hour < 24) {
    preferredEnergy = 0.4; // Night
  } else {
    preferredEnergy = 0.3; // Late night
  }

  const energyDiff = Math.abs(preferredEnergy - track.energy);
  return normalize(1 - energyDiff);
}

function calculateEnvironmentMatch(track: Track, context: Context): number {
  const env = context.environment;

  const environmentScores: Record<number, number> = {
    0: 0.9, // Home - flexible
    1: track.energy > 0.7 ? 1.0 : 0.3, // Gym - needs energy
    2: track.complexity < 0.5 ? 0.9 : 0.6, // Office - avoid distraction
    3: 0.85, // Commute
    4: track.popularity > 0.5 ? 0.8 : 0.5, // Public
    5: track.valence > 17 ? 0.9 : 0.6, // Outdoor - prefer uplifting
    7: 0.8, // Mixed
  };

  return environmentScores[env] || 0.8;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalize(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.abs((date2.getTime() - date1.getTime()) / msPerDay);
}
