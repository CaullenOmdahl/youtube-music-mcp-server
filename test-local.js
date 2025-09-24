import { default as createServer } from './.smithery/index.cjs';

// Test that the server can be created without errors
try {
  console.log('Testing server creation...');

  // The built server auto-starts, so we just need to import it
  // If there are any Zod or validation errors, they'll happen here

  console.log('✅ Server module loaded successfully');

  // Give it a moment to start up
  setTimeout(() => {
    console.log('✅ Server started without errors');
    process.exit(0);
  }, 1000);

} catch (error) {
  console.error('❌ Server test failed:', error);
  process.exit(1);
}