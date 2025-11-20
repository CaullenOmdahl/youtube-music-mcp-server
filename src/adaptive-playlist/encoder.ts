import type { Profile } from './types.js';

/**
 * Encode a profile to 37-character alphanumeric string
 * Format: 1-XXXXX... (version + dash + 35 data characters = 37 total)
 */
export function encodeProfile(profile: Partial<Profile>): string {
  const chars: string[] = [];

  // Position 0: Version
  chars.push(profile.version || '1');

  // Add dash separator
  chars.push('-');

  // Positions 1-2: Style Familiarity (0-1295, 2 chars)
  chars.push(encodeBase36(profile.styleFamiliarity ?? 500, 2));

  // Positions 3-4: Track Exposure (0-1295, 2 chars)
  chars.push(encodeBase36(profile.trackExposure ?? 7, 2));

  // Position 5: Recency (0-35, 1 char)
  chars.push(encodeBase36(profile.recency ?? 35, 1));

  // Positions 6-10: MUSIC Dimensions (0-35, 1 char each)
  chars.push(encodeBase36(profile.dimensions?.mellow ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.sophisticated ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.intense ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.contemporary ?? 17, 1));
  chars.push(encodeBase36(profile.dimensions?.unpretentious ?? 17, 1));

  // Position 11: Tempo (0-35, 1 char)
  chars.push(encodeBase36(profile.tempo ?? 17, 1));

  // Position 12: Complexity (0-35, 1 char)
  chars.push(encodeBase36(profile.complexity ?? 17, 1));

  // Position 13: Mode (0-35, 1 char)
  chars.push(encodeBase36(profile.mode ?? 17, 1));

  // Position 14: Predictability (0-35, 1 char)
  chars.push(encodeBase36(profile.predictability ?? 17, 1));

  // Position 15: Consonance (0-35, 1 char)
  chars.push(encodeBase36(profile.consonance ?? 22, 1));

  // Position 16: Activity (0-15, 1 char)
  chars.push(encodeBase36(profile.activity ?? 0, 1));

  // Position 17: Time Pattern (0-35, 1 char)
  chars.push(encodeBase36(profile.timePattern ?? 35, 1));

  // Position 18: Social Function (0-35, 1 char)
  chars.push(encodeBase36(profile.socialFunction ?? 17, 1));

  // Position 19: Environment (0-9, 1 char)
  chars.push(encodeBase36(profile.environment ?? 0, 1));

  // Position 20: Mood Valence (0-35, 1 char)
  chars.push(encodeBase36(profile.mood?.valence ?? 17, 1));

  // Position 21: Mood Arousal (0-35, 1 char)
  chars.push(encodeBase36(profile.mood?.arousal ?? 17, 1));

  // Position 22: Target Valence (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.mood?.targetValence ?? -1, 1));

  // Position 23: Target Arousal (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.mood?.targetArousal ?? -1, 1));

  // Position 24: Regulation Strategy (0-9, 1 char)
  chars.push(encodeBase36(profile.mood?.regulationStrategy ?? 5, 1));

  // Position 25: Birth Decade (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.age?.birthDecade ?? -1, 1));

  // Position 26: Reminiscence Era (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.age?.reminiscenceEra ?? -1, 1));

  // Position 27: Stated Discovery (0-35, 1 char)
  chars.push(encodeBase36(profile.discovery?.stated ?? 17, 1));

  // Position 28: Behavioral Openness (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.discovery?.behavioral ?? -1, 1));

  // Position 29: Musical Training (0-9, 1 char)
  chars.push(encodeBase36(profile.sophistication?.training ?? 0, 1));

  // Position 30: Self-Rated Expertise (0-35, 1 char)
  chars.push(encodeBase36(profile.sophistication?.expertise ?? 17, 1));

  // Position 31: Openness Trait (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.tertiary?.openness ?? -1, 1));

  // Position 32: Extraversion (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.tertiary?.extraversion ?? -1, 1));

  // Position 33: Empathizing-Systemizing (0-35, 1 char, -1 = unknown)
  chars.push(encodeBase36(profile.tertiary?.empathizingSystemizing ?? -1, 1));

  // Position 34: Cultural Context (0-35, 1 char)
  chars.push(encodeBase36(profile.tertiary?.culturalContext ?? 17, 1));

  // Position 35: Lyric Importance (0-35, 1 char)
  chars.push(encodeBase36(profile.lyricImportance ?? 17, 1));

  // Position 36: Confidence (0-35, 1 char)
  chars.push(encodeBase36(calculateConfidence(profile), 1));

  const encoded = chars.join('');

  // Validate length (1 version + 1 dash + 35 data = 37)
  if (encoded.length !== 37) {
    throw new Error(`Invalid encoding length: ${encoded.length}, expected 37`);
  }

  return encoded;
}

/**
 * Decode 37-character string to Profile
 */
export function decodeProfile(code: string): Profile {
  // Validate format
  if (code.length !== 37) {
    throw new Error(`Invalid profile code length: ${code.length}, expected 37`);
  }

  if (!/^[1-9A-Z]-[0-9A-ZX]{35}$/.test(code)) {
    throw new Error(`Invalid profile code format: ${code}`);
  }

  let pos = 0;

  // Position 0: Version
  const version = code.charAt(pos++) || '1';
  pos++; // Skip dash

  // Starting position for data (after version and dash)
  const dataStart = 2;

  const profile: Profile = {
    version,
    styleFamiliarity: decodeBase36(code.substring(dataStart, dataStart + 2)),
    trackExposure: decodeBase36(code.substring(dataStart + 2, dataStart + 4)),
    recency: decodeBase36(code.charAt(dataStart + 4)),
    dimensions: {
      mellow: decodeBase36(code.charAt(dataStart + 5)),
      sophisticated: decodeBase36(code.charAt(dataStart + 6)),
      intense: decodeBase36(code.charAt(dataStart + 7)),
      contemporary: decodeBase36(code.charAt(dataStart + 8)),
      unpretentious: decodeBase36(code.charAt(dataStart + 9)),
    },
    tempo: decodeBase36(code.charAt(dataStart + 10)),
    complexity: decodeBase36(code.charAt(dataStart + 11)),
    mode: decodeBase36(code.charAt(dataStart + 12)),
    predictability: decodeBase36(code.charAt(dataStart + 13)),
    consonance: decodeBase36(code.charAt(dataStart + 14)),
    activity: decodeBase36(code.charAt(dataStart + 15)),
    timePattern: decodeBase36(code.charAt(dataStart + 16)),
    socialFunction: decodeBase36(code.charAt(dataStart + 17)),
    environment: decodeBase36(code.charAt(dataStart + 18)),
    mood: {
      valence: decodeBase36(code.charAt(dataStart + 19)),
      arousal: decodeBase36(code.charAt(dataStart + 20)),
      targetValence: decodeBase36(code.charAt(dataStart + 21)),
      targetArousal: decodeBase36(code.charAt(dataStart + 22)),
      regulationStrategy: decodeBase36(code.charAt(dataStart + 23)),
    },
    age: {
      birthDecade: decodeBase36(code.charAt(dataStart + 24)),
      reminiscenceEra: decodeBase36(code.charAt(dataStart + 25)),
    },
    discovery: {
      stated: decodeBase36(code.charAt(dataStart + 26)),
      behavioral: decodeBase36(code.charAt(dataStart + 27)),
    },
    sophistication: {
      training: decodeBase36(code.charAt(dataStart + 28)),
      expertise: decodeBase36(code.charAt(dataStart + 29)),
    },
    tertiary: {
      openness: decodeBase36(code.charAt(dataStart + 30)),
      extraversion: decodeBase36(code.charAt(dataStart + 31)),
      empathizingSystemizing: decodeBase36(code.charAt(dataStart + 32)),
      culturalContext: decodeBase36(code.charAt(dataStart + 33)),
    },
    lyricImportance: decodeBase36(code.charAt(dataStart + 34)),
    confidence: decodeBase36(code.charAt(dataStart + 35)),
  };

  return profile;
}

/**
 * Calculate confidence score (0-35) based on profile completeness
 */
export function calculateConfidence(profile: Partial<Profile>): number {
  let score = 0;

  // Critical dimensions (30 points max)
  if (profile.styleFamiliarity !== undefined && profile.styleFamiliarity >= 0) {
    score += 10; // Familiarity is most important (30% weight)
  }
  if (profile.activity !== undefined && profile.activity >= 0) {
    score += 6; // Activity context (8% weight)
  }
  if (profile.dimensions && Object.values(profile.dimensions).some((v) => v >= 0)) {
    score += 5; // MUSIC dimensions (12% weight)
  }
  if (profile.discovery?.stated !== undefined && profile.discovery.stated >= 0) {
    score += 4; // Discovery tolerance (4% weight)
  }
  if (profile.mood && (profile.mood.valence >= 0 || profile.mood.arousal >= 0)) {
    score += 3; // Mood (8% weight)
  }
  if (profile.age?.birthDecade !== undefined && profile.age.birthDecade >= 0) {
    score += 3; // Age (5% weight)
  }

  // Other dimensions (5 points max)
  const otherDimensions = [
    profile.tempo,
    profile.complexity,
    profile.mode,
    profile.socialFunction,
    profile.environment,
  ].filter((v) => v !== undefined && v >= 0);

  score += Math.min(otherDimensions.length, 4);

  return Math.min(35, score);
}

/**
 * Extract profile code from playlist description
 */
export function extractProfileCode(description: string): string | null {
  // Look for embedded profile: 🧬:1-XXXX... or PROFILE:1-XXXX...
  const patterns = [
    /🧬:([1-9A-Z]-[0-9A-ZX]{35})/,
    /PROFILE:([1-9A-Z]-[0-9A-ZX]{35})/i,
    /<!--\s*PROFILE:([1-9A-Z]-[0-9A-ZX]{35})\s*-->/,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Embed profile code in playlist description
 */
export function embedProfileCode(description: string, profileCode: string): string {
  return `${description}\n\n🧬:${profileCode}`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function encodeBase36(value: number, length: number): string {
  if (value < 0 || !Number.isFinite(value)) {
    return 'X'.repeat(length); // Unknown marker
  }

  const encoded = value.toString(36).toUpperCase();
  const padded = encoded.padStart(length, '0');

  return padded.slice(0, length); // Truncate if too long
}

function decodeBase36(encoded: string): number {
  if (encoded.includes('X')) {
    return -1; // Unknown marker
  }

  const value = parseInt(encoded, 36);
  return isNaN(value) ? -1 : value;
}
