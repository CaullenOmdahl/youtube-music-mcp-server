import { initializeDatabase } from './client.js';

async function migrate() {
  try {
    console.log('🚀 Starting database migration...');

    await initializeDatabase();

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export default migrate;
