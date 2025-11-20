import type { Track, Profile, Context, ScoringResult } from '../types.js';
import { calculatePrimaryScore } from './primary.js';
import { calculateSecondaryScore, calculateAge, calculateUserNoveltyTolerance } from './secondary.js';
import { calculateTertiaryScore } from './tertiary.js';

/**
 * Calculate final recommendation score for a track
 * Combines primary (70%) + secondary (20%) + tertiary (10%) tiers
 * Applies contextual modulation and exploration factor
 */
export function calculateFinalScore(
  track: Track,
  profile: Profile,
  context: Context
): ScoringResult {
  // PRIMARY TIER (70%)
  const primaryScore = calculatePrimaryScore(track, profile, context);

  // SECONDARY TIER (20%)
  const secondaryScore = calculateSecondaryScore(track, profile, context);

  // TERTIARY TIER (10%)
  const tertiaryScore = calculateTertiaryScore(track, profile);

  // BASE SCORE (sums to 1.0 weight)
  const baseScore = primaryScore + secondaryScore + tertiaryScore;

  // CONTEXTUAL MODULATION
  const modulation = applyContextualModulation(baseScore, track, context, profile);
  const modulatedScore = baseScore * modulation;

  // EXPLORATION FACTOR
  const exploration = calculateExplorationFactor(track, profile);

  // FINAL SCORE
  const finalScore = modulatedScore * exploration;

  return {
    finalScore: normalize(finalScore),
    breakdown: {
      primary: primaryScore,
      secondary: secondaryScore,
      tertiary: tertiaryScore,
    },
    modulation,
    exploration,
  };
}

/**
 * Apply contextual modulation based on mood, activity, and social context
 * Returns a multiplier to apply to the base score
 */
function applyContextualModulation(
  baseScore: number,
  track: Track,
  context: Context,
  profile: Profile
): number {
  let modulation = 1.0;

  // Mood-based modulation
  if (context.moodValence < 12 && context.moodArousal > 20) {
    // Stressed/anxious - prefer familiar
    if (track.noveltyScore && track.noveltyScore > 0.5) {
      modulation *= 0.5;
    }
    if (track.familiarityScore && track.familiarityScore > 0.8) {
      modulation *= 1.3;
    }
    if (track.complexity > profile.complexity / 35 + 0.2) {
      modulation *= 0.6;
    }
  } else if (context.moodValence > 23 && context.moodArousal > 20) {
    // Happy/energized - more tolerant of exploration
    if (track.noveltyScore && track.noveltyScore > 0.3) {
      modulation *= 1.2;
    }
  }

  // Activity-based modulation
  if (context.activity === 1) {
    // Workout
    if (track.tempo < 110 || track.energy < 0.7) {
      modulation *= 0.3; // Severe penalty
    } else {
      modulation *= 1.2;
    }
  } else if (context.activity === 2) {
    // Focus
    if (track.hasLyrics && track.complexity > 0.5) {
      modulation *= 0.6;
    }
    if (track.energy > 0.6) {
      modulation *= 0.7;
    }
  } else if (context.activity === 7) {
    // Active discovery
    if (track.noveltyScore && track.noveltyScore > 0.4) {
      modulation *= 2.0;
    }
  }

  // Social context modulation
  if (context.socialFunction > 25) {
    // Party
    if (track.popularity < 0.5) {
      modulation *= 0.4;
    }
    if (track.mainstream) {
      modulation *= 1.5;
    }
  }

  // Age-based social influence
  const age = calculateAge(profile.age.birthDecade);
  if (age < 25 && context.socialFunction > 10) {
    if (track.isTrending) {
      modulation *= 1.4;
    }
  }

  return modulation;
}

/**
 * Calculate exploration factor based on user's novelty tolerance
 * Provides stochastic exploration/exploitation balance
 */
function calculateExplorationFactor(track: Track, profile: Profile): number {
  const userTolerance = calculateUserNoveltyTolerance(profile);

  // Determine exploration ratio
  let explorationRatio: number;
  if (userTolerance > 0.7) {
    explorationRatio = 0.3;
  } else if (userTolerance > 0.4) {
    explorationRatio = 0.2;
  } else {
    explorationRatio = 0.1;
  }

  // Classify track as novel or familiar
  const isNovel = (track.noveltyScore || 0.5) > 0.5;

  if (isNovel) {
    // Novel track - allow through based on exploration ratio
    return Math.random() < explorationRatio ? 1.0 : 0.3;
  } else {
    // Familiar track - suppress slightly to make room for exploration
    return Math.random() < explorationRatio ? 0.7 : 1.0;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalize(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// EXPORTS
// ============================================================================

export { calculatePrimaryScore } from './primary.js';
export { calculateSecondaryScore } from './secondary.js';
export { calculateTertiaryScore } from './tertiary.js';
