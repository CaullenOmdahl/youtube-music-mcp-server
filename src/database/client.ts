import { Pool, PoolClient } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create connection pool (will be null if no DATABASE_URL configured)
let pool: Pool | null = null;

if (config.databaseUrl) {
  const isProduction = config.nodeEnv === 'production';

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: isProduction ? { rejectUnauthorized: false } : false,

    // Pool settings
    min: config.databasePoolMin,
    max: config.databasePoolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000, // 10s max per query

    // Keep-alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,

    application_name: 'youtube-music-mcp'
  });
} else {
  console.warn('⚠️  DATABASE_URL not configured - adaptive playlists will not be available');
}

// Event handlers
if (pool) {
  pool.on('connect', () => {
    console.log('🔌 New database connection established');
  });

  pool.on('acquire', () => {
    if (!pool) return;
    const activeConnections = pool.totalCount;
    const waitingClients = pool.waitingCount;

    if (waitingClients > 5) {
      console.warn(`⚠️  High connection wait queue: ${waitingClients} clients waiting`);
    }

    if (activeConnections > config.databasePoolMax * 0.8) {
      console.warn(`⚠️  Connection pool near capacity: ${activeConnections}/${config.databasePoolMax}`);
    }
  });

  pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🔄 Draining database connection pool...');
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  });
}

// Initialize database (run migrations)
export async function initializeDatabase(): Promise<void> {
  if (!pool) {
    console.log('⏭️  Skipping database initialization - no DATABASE_URL configured');
    return;
  }

  try {
    console.log('🔄 Initializing database...');

    const client = await pool.connect();

    try {
      // Read schema file
      const schemaPath = join(__dirname, 'schema.sql');
      const schemaSql = readFileSync(schemaPath, 'utf-8');

      // Execute schema
      await client.query(schemaSql);

      console.log('✅ Database schema initialized');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
}> {
  if (!pool) {
    return {
      healthy: false,
      totalConnections: 0,
      idleConnections: 0,
      waitingClients: 0
    };
  }

  return {
    healthy: pool.totalCount > 0,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount
  };
}

// Query wrapper with logging
export const db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: async (text: string, params?: any[]) => {
    if (!pool) {
      throw new Error('Database not configured - DATABASE_URL is missing');
    }

    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;

      // Log slow queries
      if (duration > 1000) {
        console.warn(`🐌 Slow query (${duration}ms):`, text.substring(0, 100));
      }

      return result;
    } catch (error) {
      console.error('❌ Query error:', error);
      throw error;
    }
  },

  getClient: (): Promise<PoolClient> => {
    if (!pool) {
      throw new Error('Database not configured - DATABASE_URL is missing');
    }
    return pool.connect();
  }
};

export default db;
