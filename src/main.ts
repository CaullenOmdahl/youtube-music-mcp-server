/**
 * Local development entry point
 * Starts the HTTP server for local testing
 */
import { createServer } from './server.js';

async function main() {
  const server = await createServer();

  await server.start();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
