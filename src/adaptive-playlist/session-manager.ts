import type { ConversationSession, Profile, Database } from './types.js';
import { calculateConfidence } from './encoder.js';
import { createLogger } from '../utils/logger.js';
import { randomBytes } from 'crypto';

const logger = createLogger('session-manager');

/**
 * Manages conversation sessions for adaptive playlist building
 */
export class SessionManager {
  // In-memory cache of active sessions
  private sessionCache = new Map<string, ConversationSession>();

  constructor(private db: Database) {}

  /**
   * Create a new conversation session
   */
  async createSession(userId: string): Promise<ConversationSession> {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    const expiresAt = now + 1000 * 60 * 60 * 24; // 24 hours

    const session: ConversationSession = {
      sessionId,
      userId,
      questionsAsked: 0,
      confidence: 0,
      createdAt: now,
      expiresAt,
      conversationHistory: [
        {
          role: 'ai',
          message:
            "Hi! I'll help you create a personalized playlist. Let's chat about your music preferences. What have you been listening to lately?",
          timestamp: now,
        },
      ],
      profile: {
        version: '1',
        dimensions: {},
        mood: {},
        age: {},
        discovery: {},
        sophistication: {},
        tertiary: {},
      } as Partial<Profile>,
      completed: false,
    };

    // Save to database
    try {
      await this.db.query(
        `INSERT INTO conversation_sessions (
          session_id, user_id, profile_partial, conversation_history,
          questions_asked, confidence, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7/1000.0), to_timestamp($8/1000.0))`,
        [
          sessionId,
          userId,
          JSON.stringify(session.profile),
          JSON.stringify(session.conversationHistory),
          session.questionsAsked,
          session.confidence,
          session.createdAt,
          session.expiresAt,
        ]
      );

      // Cache in memory
      this.sessionCache.set(sessionId, session);

      logger.info('Session created', { sessionId, userId });

      return session;
    } catch (error) {
      logger.error('Failed to create session', { error, userId });
      throw new Error('Failed to create conversation session');
    }
  }

  /**
   * Get an existing session
   */
  async getSession(sessionId: string): Promise<ConversationSession | null> {
    // Check cache first
    if (this.sessionCache.has(sessionId)) {
      const cached = this.sessionCache.get(sessionId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached;
      }
      // Expired, remove from cache
      this.sessionCache.delete(sessionId);
    }

    // Load from database
    try {
      const result = await this.db.query(
        `SELECT * FROM conversation_sessions WHERE session_id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as {
        session_id: string;
        user_id: string;
        profile_partial: string;
        conversation_history: string;
        questions_asked: number;
        confidence: number;
        ai_notes: string | null;
        created_at: Date;
        expires_at: Date;
        completed: boolean;
      };

      const session: ConversationSession = {
        sessionId: row.session_id,
        userId: row.user_id,
        questionsAsked: row.questions_asked,
        confidence: row.confidence,
        createdAt: new Date(row.created_at).getTime(),
        expiresAt: new Date(row.expires_at).getTime(),
        conversationHistory: JSON.parse(row.conversation_history),
        profile: JSON.parse(row.profile_partial),
        aiNotes: row.ai_notes || undefined,
        completed: row.completed,
      };

      // Check if expired
      if (session.expiresAt < Date.now()) {
        logger.debug('Session expired', { sessionId });
        return null;
      }

      // Cache
      this.sessionCache.set(sessionId, session);

      return session;
    } catch (error) {
      logger.error('Failed to get session', { error, sessionId });
      return null;
    }
  }

  /**
   * Update session with new conversation message and extracted profile data
   */
  async updateSession(
    sessionId: string,
    userMessage: string,
    aiResponse: string,
    extractedInfo?: Partial<Profile>
  ): Promise<ConversationSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found or expired');
    }

    const now = Date.now();

    // Add user message
    session.conversationHistory.push({
      role: 'user',
      message: userMessage,
      timestamp: now,
      extractedInfo,
    });

    // Add AI response
    session.conversationHistory.push({
      role: 'ai',
      message: aiResponse,
      timestamp: now,
    });

    // Merge extracted info into profile
    if (extractedInfo) {
      session.profile = this.mergeProfile(session.profile, extractedInfo);
    }

    // Increment questions asked
    session.questionsAsked++;

    // Recalculate confidence
    session.confidence = calculateConfidence(session.profile);

    // Update in database
    try {
      await this.db.query(
        `UPDATE conversation_sessions SET
          conversation_history = $1,
          profile_partial = $2,
          questions_asked = $3,
          confidence = $4,
          last_activity_at = CURRENT_TIMESTAMP
        WHERE session_id = $5`,
        [
          JSON.stringify(session.conversationHistory),
          JSON.stringify(session.profile),
          session.questionsAsked,
          session.confidence,
          sessionId,
        ]
      );

      // Update cache
      this.sessionCache.set(sessionId, session);

      logger.debug('Session updated', {
        sessionId,
        questionsAsked: session.questionsAsked,
        confidence: session.confidence,
      });

      return session;
    } catch (error) {
      logger.error('Failed to update session', { error, sessionId });
      throw new Error('Failed to update session');
    }
  }

  /**
   * Mark session as completed
   */
  async completeSession(sessionId: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE conversation_sessions SET completed = true WHERE session_id = $1`,
        [sessionId]
      );

      const session = this.sessionCache.get(sessionId);
      if (session) {
        session.completed = true;
      }

      logger.info('Session completed', { sessionId });
    } catch (error) {
      logger.error('Failed to complete session', { error, sessionId });
      throw new Error('Failed to complete session');
    }
  }

  /**
   * Check if session is ready for playlist generation
   */
  isReadyForPlaylist(session: ConversationSession): boolean {
    return session.questionsAsked >= 5 && session.confidence >= 21;
  }

  /**
   * Cleanup expired sessions (called periodically)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.db.query('SELECT cleanup_expired_sessions() as count');
      const count = (result.rows[0] as { count: number })?.count || 0;

      logger.info('Cleaned up expired sessions', { count });

      // Clear from cache
      for (const [sessionId, session] of this.sessionCache.entries()) {
        if (session.expiresAt < Date.now()) {
          this.sessionCache.delete(sessionId);
        }
      }

      return count;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error });
      return 0;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `sess_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Merge profile data from conversation
   */
  private mergeProfile(existing: Partial<Profile>, extracted: Partial<Profile>): Partial<Profile> {
    const merged: Partial<Profile> = {
      ...existing,
      ...extracted,
    };

    // Merge nested objects if both exist
    if (existing.dimensions || extracted.dimensions) {
      merged.dimensions = {
        ...(existing.dimensions || {}),
        ...(extracted.dimensions || {}),
      } as typeof merged.dimensions;
    }
    if (existing.mood || extracted.mood) {
      merged.mood = {
        ...(existing.mood || {}),
        ...(extracted.mood || {}),
      } as typeof merged.mood;
    }
    if (existing.age || extracted.age) {
      merged.age = {
        ...(existing.age || {}),
        ...(extracted.age || {}),
      } as typeof merged.age;
    }
    if (existing.discovery || extracted.discovery) {
      merged.discovery = {
        ...(existing.discovery || {}),
        ...(extracted.discovery || {}),
      } as typeof merged.discovery;
    }
    if (existing.sophistication || extracted.sophistication) {
      merged.sophistication = {
        ...(existing.sophistication || {}),
        ...(extracted.sophistication || {}),
      } as typeof merged.sophistication;
    }
    if (existing.tertiary || extracted.tertiary) {
      merged.tertiary = {
        ...(existing.tertiary || {}),
        ...(extracted.tertiary || {}),
      } as typeof merged.tertiary;
    }

    return merged;
  }
}
