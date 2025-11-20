import type { Track, Profile, Context } from '../types.js';

/**
 * SECONDARY TIER SCORING (20% of total weight)
 * Components: Mood (8%) + Age (5%) + Discovery (4%) + Sophistication (3%)
 */

/**
 * Calculate secondary tier score (20% weight)
 */
export function calculateSecondaryScore(track: Track, profile: Profile, context: Context): number {
  const mood = calculateMoodMatch(track, context, profile) * 0.08;
  const age = calculateAgeAppropriateness(track, profile) * 0.05;
  const discovery = calculateDiscoveryAdjustedNovelty(track, profile) * 0.04;
  const sophistication = calculateSophisticationMatch(track, profile) * 0.03;

  return normalize(mood + age + discovery + sophistication);
}

/**
 * 4. Mood Match (8% of total)
 */
export function calculateMoodMatch(track: Track, context: Context, profile: Profile): number {
  const currentAlignment = calculateCurrentMoodAlignment(track, context) * 0.625;
  const regulationFit = calculateRegulationGoalFit(track, context, profile) * 0.375;

  return normalize(currentAlignment + regulationFit);
}

function calculateCurrentMoodAlignment(track: Track, context: Context): number {
  // 2D mood space: valence (x-axis) and arousal (y-axis)
  const valenceDiff = Math.abs(context.moodValence - track.valence) / 35;
  const arousalDiff = Math.abs(context.moodArousal - track.arousal) / 35;

  // Euclidean distance in normalized mood space
  const distance = Math.sqrt(valenceDiff ** 2 + arousalDiff ** 2);
  const maxDistance = Math.sqrt(2); // Maximum distance in unit square

  return 1 - distance / maxDistance;
}

function calculateRegulationGoalFit(
  track: Track,
  context: Context,
  _profile: Profile
): number {
  const strategy = context.regulationStrategy;

  if (strategy === 0) {
    // Match mood (iso-principle) - already scored in alignment
    return calculateCurrentMoodAlignment(track, context);
  } else if (strategy === 9) {
    // Contrast mood - want opposite
    const targetValenceDiff = Math.abs(context.targetValence - track.valence) / 35;
    const targetArousalDiff = Math.abs(context.targetArousal - track.arousal) / 35;
    const distance = Math.sqrt(targetValenceDiff ** 2 + targetArousalDiff ** 2);
    return 1 - distance / Math.sqrt(2);
  } else {
    // Balanced approach (5) or gradual transition
    const currentAlign = calculateCurrentMoodAlignment(track, context);
    const targetValenceDiff = Math.abs(context.targetValence - track.valence) / 35;
    const targetArousalDiff = Math.abs(context.targetArousal - track.arousal) / 35;
    const targetDistance = Math.sqrt(targetValenceDiff ** 2 + targetArousalDiff ** 2);
    const targetAlign = 1 - targetDistance / Math.sqrt(2);

    // Blend based on strategy value (0-9 scale)
    const blendRatio = strategy / 9;
    return currentAlign * (1 - blendRatio) + targetAlign * blendRatio;
  }
}

/**
 * 5. Age Appropriateness (5% of total)
 */
export function calculateAgeAppropriateness(track: Track, profile: Profile): number {
  const currentAgeFit = calculateCurrentAgeFit(track, profile) * 0.4;
  const reminiscenceBump = calculateReminiscenceBumpMatch(track, profile) * 0.6;

  return normalize(currentAgeFit + reminiscenceBump);
}

function calculateCurrentAgeFit(track: Track, profile: Profile): number {
  const birthDecade = profile.age.birthDecade;
  if (birthDecade < 0) return 0.7; // Unknown age, neutral score

  const age = calculateAge(birthDecade);

  // Age-based dimension preferences
  let dimensionScore = 0.7; // Default

  if (age < 18) {
    // Prefer Intense + Contemporary
    dimensionScore = (track.dimensions.intense + track.dimensions.contemporary) / 70;
  } else if (age >= 18 && age < 25) {
    dimensionScore =
      (track.dimensions.intense * 0.6 +
        track.dimensions.contemporary * 0.7 +
        track.dimensions.mellow * 0.4) /
      51;
  } else if (age >= 25 && age < 35) {
    dimensionScore =
      (track.dimensions.contemporary * 0.6 + track.dimensions.mellow * 0.5) / 38.5;
  } else if (age >= 35 && age < 50) {
    dimensionScore =
      (track.dimensions.sophisticated * 0.6 + track.dimensions.mellow * 0.6) / 42;
  } else {
    dimensionScore =
      (track.dimensions.sophisticated * 0.7 + track.dimensions.mellow * 0.7) / 49;
  }

  return normalize(dimensionScore);
}

function calculateReminiscenceBumpMatch(track: Track, profile: Profile): number {
  const reminiscenceEra = profile.age.reminiscenceEra;
  if (reminiscenceEra < 0) return 0.7; // Unknown, neutral score

  const trackEra = getDecadeFromYear(track.releaseYear);

  if (trackEra === reminiscenceEra) {
    return 1.0; // Peak preference
  }

  const eraDiff = Math.abs(trackEra - reminiscenceEra);

  if (eraDiff <= 1) {
    return 0.9; // Adjacent decade
  } else if (eraDiff <= 2) {
    return 0.7; // Within formative period
  } else {
    return 0.5; // Outside formative period
  }
}

export function calculateAge(birthDecade: number): number {
  // birthDecade: 0=<1960, 5=1980s, A(10)=2000s, F(15)=2010s
  const currentYear = new Date().getFullYear();
  const birthYear =
    birthDecade < 10 ? 1960 + birthDecade * 10 : 2000 + (birthDecade - 10) * 10;
  return currentYear - birthYear;
}

function getDecadeFromYear(year: number): number {
  return Math.floor((year - 1960) / 10);
}

/**
 * 6. Discovery Adjusted Novelty (4% of total)
 */
export function calculateDiscoveryAdjustedNovelty(track: Track, profile: Profile): number {
  const userTolerance = calculateUserNoveltyTolerance(profile);
  const trackNovelty = calculateTrackNoveltyScore(track, profile);

  return normalize(userTolerance * trackNovelty);
}

export function calculateUserNoveltyTolerance(profile: Profile): number {
  const stated = profile.discovery.stated / 35; // 0-1 range
  const behavioral = profile.discovery.behavioral / 35; // 0-1 range

  // If behavioral data available, weight it more
  if (behavioral >= 0) {
    return stated * 0.3 + behavioral * 0.7;
  }
  return stated;
}

function calculateTrackNoveltyScore(track: Track, profile: Profile): number {
  // Artist unfamiliarity
  const artistUnfamiliarity = track.isNewArtist ? 1.0 : 1 - track.artistFamiliarity;

  // Style unfamiliarity (inverse of style familiarity)
  const userStyles = profile.familiarStyles;
  let styleUnfamiliarity = 0.5; // Default
  if (userStyles && track.genres.length > 0) {
    const genreOverlap = track.genres.filter((g) => userStyles.genres.includes(g)).length / Math.max(track.genres.length, userStyles.genres.length);
    styleUnfamiliarity = 1 - genreOverlap;
  }

  // Attribute distance from user's average
  const attributeDistance = calculateAttributeDistance(track, profile);

  // Era distance
  const userMedianYear = profile.age.reminiscenceEra * 10 + 1960;
  const eraDistance = Math.abs(track.releaseYear - userMedianYear) / 50;

  // Popularity inverse (rare = novel)
  const popularityInverse = 1 - (track.popularity || 0.5);

  // Weighted combination
  return normalize(
    artistUnfamiliarity * 0.35 +
      styleUnfamiliarity * 0.35 +
      attributeDistance * 0.2 +
      eraDistance * 0.05 +
      popularityInverse * 0.05
  );
}

function calculateAttributeDistance(track: Track, profile: Profile): number {
  // Euclidean distance in feature space (normalized)
  const tempoDiff = Math.abs(track.tempo - profile.tempo) / 35;
  const complexityDiff = Math.abs(track.complexity - profile.complexity / 35);
  const valenceDiff = Math.abs(track.valence - profile.mood.valence) / 35;
  const arousalDiff = Math.abs(track.arousal - profile.mood.arousal) / 35;

  const distance = Math.sqrt(
    tempoDiff ** 2 + complexityDiff ** 2 + valenceDiff ** 2 + arousalDiff ** 2
  );

  const maxDistance = Math.sqrt(4); // Max distance in 4D unit hypercube
  return distance / maxDistance;
}

/**
 * 7. Sophistication Complexity Match (3% of total)
 */
export function calculateSophisticationMatch(track: Track, profile: Profile): number {
  const userSophistication = calculateUserSophistication(profile);
  const optimalComplexity = userSophistication * 0.7 + 0.3;

  // Inverted-U curve
  const complexityDiff = Math.abs(track.complexity - optimalComplexity);

  if (complexityDiff < 0.1) return 1.0;
  else if (complexityDiff < 0.2) return 0.9;
  else if (complexityDiff < 0.3) return 0.7;
  else if (complexityDiff < 0.4) return 0.6;
  else if (complexityDiff < 0.5) return 0.4;
  else return 0.2;
}

function calculateUserSophistication(profile: Profile): number {
  const training = profile.sophistication.training / 9; // 0-1 range
  const sophisticatedDimension = profile.dimensions.sophisticated / 35;
  const expertise = profile.sophistication.expertise / 35;

  // Combine indicators
  return normalize(training * 0.3 + sophisticatedDimension * 0.4 + expertise * 0.3);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalize(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}
