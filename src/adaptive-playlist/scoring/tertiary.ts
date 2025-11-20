import type { Track, Profile } from '../types.js';

/**
 * TERTIARY TIER SCORING (10% of total weight)
 * Components: Personality (5%) + Cognitive (3%) + Cultural (2%)
 */

/**
 * Calculate tertiary tier score (10% weight)
 */
export function calculateTertiaryScore(track: Track, profile: Profile): number {
  const personality = calculatePersonalityIndicators(track, profile) * 0.05;
  const cognitive = calculateCognitiveStyleIndicators(track, profile) * 0.03;
  const cultural = calculateCulturalContextFit(track, profile) * 0.02;

  return normalize(personality + cognitive + cultural);
}

/**
 * 8. Personality Indicators (5% of total)
 */
export function calculatePersonalityIndicators(track: Track, profile: Profile): number {
  const openness = calculateOpennessMatch(track, profile) * 0.5;
  const extraversion = calculateExtraversionMatch(track, profile) * 0.25;
  const other = 0.8 * 0.25; // Neutral for other traits

  return normalize(openness + extraversion + other);
}

function calculateOpennessMatch(track: Track, profile: Profile): number {
  const openness = profile.tertiary.openness / 35;

  if (openness < 0) return 0.7; // Unknown, neutral

  if (openness > 0.7) {
    // High openness: prefer sophisticated/complex/novel
    const trackSophistication =
      (track.dimensions.sophisticated / 35) * 0.5 + track.complexity * 0.5;
    return trackSophistication;
  } else if (openness < 0.3) {
    // Low openness: prefer simple/familiar/mainstream
    const trackSimplicity =
      (track.dimensions.unpretentious / 35) * 0.5 + (1 - track.complexity) * 0.5;
    return trackSimplicity;
  }
  return 0.7; // Neutral for moderate openness
}

function calculateExtraversionMatch(track: Track, profile: Profile): number {
  const extraversion = profile.tertiary.extraversion / 35;

  if (extraversion < 0) return 0.8; // Unknown, neutral

  if (extraversion > 0.7) {
    // High extraversion: prefer contemporary/energetic
    return (track.dimensions.contemporary / 35) * 0.6 + track.energy * 0.4;
  } else if (extraversion < 0.3) {
    // Low extraversion: prefer mellow/introspective
    return track.dimensions.mellow / 35;
  }
  return 0.8; // Weak preference for moderate
}

/**
 * 9. Cognitive Style Indicators (3% of total)
 */
export function calculateCognitiveStyleIndicators(track: Track, profile: Profile): number {
  const empathizingSystemizing = profile.tertiary.empathizingSystemizing;

  if (empathizingSystemizing < 0) return 0.8; // Unknown, neutral

  if (empathizingSystemizing > 22) {
    // Empathizer: prefer mellow, low arousal
    return (track.dimensions.mellow / 35) * 0.7 + (1 - track.arousal / 35) * 0.3;
  } else if (empathizingSystemizing < 13) {
    // Systemizer: prefer intense, complex
    return (track.dimensions.intense / 35) * 0.7 + track.complexity * 0.3;
  }
  return 0.8; // Balanced
}

/**
 * 10. Cultural Context Fit (2% of total)
 */
export function calculateCulturalContextFit(track: Track, profile: Profile): number {
  const culturalContext = profile.tertiary.culturalContext;

  if (culturalContext < 0) return 0.7; // Unknown, neutral

  let consonancePreference: number;
  if (culturalContext < 13) {
    // Western
    consonancePreference = 0.8;
  } else if (culturalContext > 22) {
    // Non-Western
    consonancePreference = 0.5;
  } else {
    // Mixed
    consonancePreference = 0.6;
  }

  const consonanceMatch = 1 - Math.abs(consonancePreference - track.consonance / 35);

  // Weight lightly
  return 0.7 + 0.3 * consonanceMatch;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalize(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}
