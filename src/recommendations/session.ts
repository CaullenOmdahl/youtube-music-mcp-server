import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import type { PlaylistSession, MBArtist, MBRecording, Song } from '../types/index.js';

const logger = createLogger('session-manager');

export class SessionManager {
  private sessions: Map<string, PlaylistSession> = new Map();
  private sessionTtl: number = 3600000; // 1 hour in milliseconds

  constructor(ttlSeconds: number = 3600) {
    this.sessionTtl = ttlSeconds * 1000;
    logger.info('Session manager initialized', { ttlSeconds });
  }

  /**
   * Create a new playlist session
   */
  createSession(mode: 'discover' | 'from_library' | 'mixed' = 'discover'): PlaylistSession {
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    const session: PlaylistSession = {
      sessionId,
      mode,
      seedArtists: [],
      seedTracks: [],
      excludeArtists: [],
      preferTags: [],
      avoidTags: [],
      diversity: 'balanced',
      recommendations: [],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);

    logger.info('Session created', { sessionId, mode });

    // Schedule cleanup
    this.scheduleCleanup(sessionId);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): PlaylistSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.debug('Session not found', { sessionId });
      return undefined;
    }

    // Check if expired
    const createdAt = new Date(session.createdAt).getTime();
    if (Date.now() - createdAt > this.sessionTtl) {
      this.sessions.delete(sessionId);
      logger.debug('Session expired', { sessionId });
      return undefined;
    }

    return session;
  }

  /**
   * Update a session
   */
  updateSession(session: PlaylistSession): void {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.sessionId, session);

    logger.debug('Session updated', { sessionId: session.sessionId });
  }

  /**
   * Add seed artist to session
   */
  addSeedArtist(sessionId: string, artist: MBArtist): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.seedArtists.push(artist);
    this.updateSession(session);

    logger.debug('Seed artist added', {
      sessionId,
      artist: artist.name,
      totalSeeds: session.seedArtists.length,
    });
  }

  /**
   * Add seed track to session
   */
  addSeedTrack(sessionId: string, track: MBRecording): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.seedTracks.push(track);
    this.updateSession(session);

    logger.debug('Seed track added', {
      sessionId,
      track: track.title,
      totalSeeds: session.seedTracks.length,
    });
  }

  /**
   * Update refinement options
   */
  updateRefinement(
    sessionId: string,
    options: {
      excludeArtists?: string[];
      preferTags?: string[];
      avoidTags?: string[];
      diversity?: 'focused' | 'balanced' | 'diverse';
    }
  ): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (options.excludeArtists) {
      session.excludeArtists = options.excludeArtists;
    }
    if (options.preferTags) {
      session.preferTags = options.preferTags;
    }
    if (options.avoidTags) {
      session.avoidTags = options.avoidTags;
    }
    if (options.diversity) {
      session.diversity = options.diversity;
    }

    this.updateSession(session);

    logger.debug('Refinement updated', { sessionId, options });
  }

  /**
   * Set recommendations for session
   */
  setRecommendations(sessionId: string, recommendations: Song[]): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.recommendations = recommendations;
    this.updateSession(session);

    logger.debug('Recommendations set', {
      sessionId,
      count: recommendations.length,
    });
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug('Session deleted', { sessionId });
  }

  /**
   * Get all active sessions (for admin/debugging)
   */
  getActiveSessions(): PlaylistSession[] {
    const now = Date.now();
    const active: PlaylistSession[] = [];

    for (const session of this.sessions.values()) {
      const createdAt = new Date(session.createdAt).getTime();
      if (now - createdAt <= this.sessionTtl) {
        active.push(session);
      }
    }

    return active;
  }

  /**
   * Schedule session cleanup after TTL
   */
  private scheduleCleanup(sessionId: string): void {
    setTimeout(() => {
      if (this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        if (session) {
          const createdAt = new Date(session.createdAt).getTime();
          if (Date.now() - createdAt > this.sessionTtl) {
            this.sessions.delete(sessionId);
            logger.debug('Session cleaned up', { sessionId });
          }
        }
      }
    }, this.sessionTtl + 1000);
  }
}
