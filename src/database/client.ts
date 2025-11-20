import { Pool, PoolClient } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production';
const maxConnections = parseInt(process.env.DATABASE_POOL_MAX || '20');
const minConnections = parseInt(process.env.DATABASE_POOL_MIN || '5');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,

  // Pool settings
  min: minConnections,
  max: maxConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10s max per query

  // Keep-alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  application_name: 'youtube-music-mcp'
});

// Event handlers
pool.on('connect', () => {
  console.log('🔌 New database connection established');
});

pool.on('acquire', () => {
  const activeConnections = pool.totalCount;
  const waitingClients = pool.waitingCount;

  if (waitingClients > 5) {
    console.warn(`⚠️  High connection wait queue: ${waitingClients} clients waiting`);
  }

  if (activeConnections > maxConnections * 0.8) {
    console.warn(`⚠️  Connection pool near capacity: ${activeConnections}/${maxConnections}`);
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Draining database connection pool...');
  await pool.end();
  process.exit(0);
});

// Initialize database (run migrations)
export async function initializeDatabase(): Promise<void> {
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

  getClient: (): Promise<PoolClient> => pool.connect()
};

export default db;
