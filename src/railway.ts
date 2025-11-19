/**
 * Railway entry point - starts the standalone MCP server
 */
import { createServer } from './server.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('railway');

async function main() {
  try {
    logger.info('Starting YouTube Music MCP Server on Railway');

    const server = await createServer();
    await server.start();

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await server.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await server.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main();
