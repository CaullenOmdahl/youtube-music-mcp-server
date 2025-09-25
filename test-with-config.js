// Test that server works with config
import createServer from './.smithery/index.cjs';

try {
  console.log('Testing server with config...');

  // Test with empty config
  const server1 = createServer({ config: {} });
  console.log('✅ Server works with empty config');

  // Test with cookies in config
  const server2 = createServer({
    config: {
      cookies: 'test_cookie=value',
      debug: false
    }
  });
  console.log('✅ Server works with cookies in config');

  // Test without config
  const server3 = createServer({});
  console.log('✅ Server works without config');

  console.log('All tests passed!');
  process.exit(0);

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}