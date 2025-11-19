import { createServer } from './server.js';
import { config } from './config.js';
import { createLogger } from './utils/logger.js';

// Export OAuth provider for Smithery
// Smithery CLI will automatically detect and mount OAuth routes
export { oauth } from './auth/smithery-oauth-provider.js';

const logger = createLogger('main');

async function main() {
  logger.info('Starting YouTube Music MCP Server', {
    version: '3.0.0',
    nodeEnv: config.nodeEnv,
    port: config.port,
    bypassAuth: config.bypassAuth,
  });

  try {
    const server = await createServer();

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Start the server
    await server.start();

    logger.info(`Server running on port ${config.port}`);

    if (config.bypassAuth) {
      logger.warn('Authentication bypass enabled - FOR TESTING ONLY');
    }
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
