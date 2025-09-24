try {
  console.log("Testing import...");

  // Test the original source
  const src = await import('./src/index.js');
  console.log("Source import successful");
  console.log("Config schema:", src.configSchema);

  // Test server creation
  const testConfig = {
    debug: true,
    cookies: "test-cookies"
  };

  console.log("Creating server with test config...");
  const server = src.default({ config: testConfig });
  console.log("Server creation successful");

  // The server should be an MCP server instance
  console.log("Server type:", typeof server);

} catch (error) {
  console.error("Error:", error);
}