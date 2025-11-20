// ============================================================================
// CORE TYPES FOR ADAPTIVE PLAYLIST SYSTEM
// ============================================================================

export interface Profile {
  version: string; // "1" for v1

  // Familiarity (positions 1-5)
  styleFamiliarity: number; // 0-1295
  trackExposure: number; // 0-1295
  recency: number; // 0-35

  // MUSIC dimensions (positions 6-10)
  dimensions: MUSICDimensions;

  // Musical features (positions 11-15)
  tempo: number; // 0-35
  energy?: number; // 0-1 (derived, not in encoding)
  complexity: number; // 0-35
  mode: number; // 0-35
  predictability: number; // 0-35
  consonance: number; // 0-35

  // Context (positions 16-19)
  activity: number; // 0-15
  timePattern: number; // 0-35
  socialFunction: number; // 0-35
  environment: number; // 0-9

  // Mood (positions 20-24)
  mood: MoodProfile;

  // Age (positions 25-26)
  age: AgeProfile;

  // Discovery (positions 27-28)
  discovery: DiscoveryProfile;

  // Sophistication (positions 29-30)
  sophistication: SophisticationProfile;

  // Tertiary indicators (positions 31-35)
  tertiary: TertiaryProfile;

  // Metadata
  lyricImportance: number; // 0-35
  confidence: number; // 0-35

  // Derived data (not in encoding, computed from history)
  familiarStyles?: StyleProfile;
  userId?: string;
}

export interface MUSICDimensions {
  mellow: number; // 0-35
  sophisticated: number; // 0-35
  intense: number; // 0-35
  contemporary: number; // 0-35
  unpretentious: number; // 0-35
}

export interface MoodProfile {
  valence: number; // 0-35 (negative to positive)
  arousal: number; // 0-35 (calm to energetic)
  targetValence: number; // 0-35 or -1 for unknown
  targetArousal: number; // 0-35 or -1 for unknown
  regulationStrategy: number; // 0-9
}

export interface AgeProfile {
  birthDecade: number; // 0-35
  reminiscenceEra: number; // 0-35
}

export interface DiscoveryProfile {
  stated: number; // 0-35
  behavioral: number; // 0-35 or -1 for unknown
}

export interface SophisticationProfile {
  training: number; // 0-9
  expertise: number; // 0-35
}

export interface TertiaryProfile {
  openness: number; // 0-35
  extraversion: number; // 0-35
  empathizingSystemizing: number; // 0-35
  culturalContext: number; // 0-35
}

export interface StyleProfile {
  genres: string[];
  tags: string[];
  artistIds: string[];
  dimensions: MUSICDimensions;
}

// ============================================================================
// TRACK & SONG TYPES
// ============================================================================

export interface Track {
  videoId: string;
  title: string;
  artist: string;
  releaseYear: number;

  // Musical features
  dimensions: MUSICDimensions;
  tempo: number; // BPM or normalized 0-35
  energy: number; // 0-1
  complexity: number; // 0-1
  mode: number; // 0-35
  predictability: number; // 0-35
  consonance: number; // 0-35
  valence: number; // 0-35
  arousal: number; // 0-35

  // Metadata
  genres: string[];
  tags: string[];
  popularity: number; // 0-1
  mainstream: boolean;
  isTrending: boolean;
  hasLyrics: boolean;

  // User-specific (populated from history)
  userPlayCount: number;
  lastPlayedDate?: Date;
  isNewArtist: boolean;
  artistFamiliarity: number; // 0-1

  // Computed scores (cached)
  noveltyScore?: number;
  familiarityScore?: number;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface Context {
  activity: number; // 0-15
  socialFunction: number; // 0-35
  timePattern: number; // 0-35
  environment: number; // 0-9
  moodValence: number; // 0-35
  moodArousal: number; // 0-35
  targetValence: number; // 0-35
  targetArousal: number; // 0-35
  regulationStrategy: number; // 0-9
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface ConversationSession {
  sessionId: string;
  userId: string;
  questionsAsked: number;
  confidence: number;
  createdAt: number;
  expiresAt: number;
  conversationHistory: ConversationMessage[];
  profile: Partial<Profile>;
  aiNotes?: string;
  detectedContradictions?: string[];
  completed: boolean;
}

export interface ConversationMessage {
  role: 'ai' | 'user';
  message: string;
  timestamp: number;
  extractedInfo?: Partial<Profile>;
}

// ============================================================================
// RECOMMENDATION TYPES
// ============================================================================

export interface RecommendationResult {
  track: Track;
  score: number;
  breakdown: ScoreBreakdown;
  modulation: number;
  exploration: number;
  explanation?: RecommendationExplanation;
}

export interface ScoreBreakdown {
  primary: number; // 70% weight
  secondary: number; // 20% weight
  tertiary: number; // 10% weight
  components?: {
    familiarity?: number;
    musicalFeatures?: number;
    context?: number;
    mood?: number;
    age?: number;
    discovery?: number;
    sophistication?: number;
    personality?: number;
    cognitive?: number;
    cultural?: number;
  };
}

export interface RecommendationExplanation {
  primaryReasons: string[];
  scoreBreakdown: Record<string, number>;
  matchedAttributes: string[];
  noveltyLevel: 'familiar' | 'moderate' | 'novel';
}

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface Database {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  getClient: () => Promise<{
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
    release: () => void;
  }>;
}

// ============================================================================
// SERVER CONTEXT TYPES
// ============================================================================

export interface AdaptivePlaylistContext {
  ytMusic: {
    search: (query: string, options?: { filter?: string; limit?: number }) => Promise<unknown>;
    getSong: (videoId: string) => Promise<unknown>;
    getLibrarySongs: (limit?: number) => Promise<unknown[]>;
    createPlaylist: (name: string, description?: string, privacyStatus?: string) => Promise<string>;
    addPlaylistItems: (playlistId: string, videoIds: string[]) => Promise<void>;
  };
  musicBrainz: {
    searchArtist: (name: string, limit?: number) => Promise<unknown[]>;
    getArtistTags: (mbid: string) => Promise<{ name: string; count: number }[]>;
    searchRecording: (title: string, artist?: string, limit?: number) => Promise<unknown[]>;
  };
  listenBrainz?: {
    getUserListens: (userId: string, limit?: number) => Promise<unknown[]>;
  };
  db: Database;
  userId: string;
}

// ============================================================================
// SCORING TYPES
// ============================================================================

export interface ScoringResult {
  finalScore: number;
  breakdown: {
    primary: number; // 70% weight
    secondary: number; // 20% weight
    tertiary: number; // 10% weight
  };
  modulation: number; // Context multiplier
  exploration: number; // Exploration factor
}

export interface ActivityProfile {
  tempoMin?: number;
  tempoMax?: number;
  energyMin?: number;
  energyMax?: number;
  complexityMax?: number;
  instrumentalPreference?: number;
  familiarityBoost?: number;
  discoveryWeight?: number;
  preferredDimensions?: string[];
}
