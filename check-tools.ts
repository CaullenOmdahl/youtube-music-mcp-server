import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

console.log('🔍 Investigating tool registration...');

const server = new McpServer({
  name: "Test Server",
  version: "1.0.0",
});

console.log('📝 Initial registered tools:', server._registeredTools);

// Register a tool
server.registerTool(
  "test",
  {
    title: "Test",
    description: "Test tool",
    inputSchema: z.object({ msg: z.string() }),
  },
  async () => ({ content: [{ type: "text", text: "test" }] })
);

console.log('📝 After registration:', Object.keys(server._registeredTools));
console.log('📋 Tool details:', server._registeredTools);

// Check what the inner server knows about
console.log('🔧 Inner server type:', typeof server.server);

// Let's see if there's a way to check what tools the inner server knows about
const innerServer = server.server;
console.log('🔍 Inner server capabilities:', innerServer._capabilities);

// Try to manually trigger the handler initialization
console.log('⚡ Tool handlers initialized:', server._toolHandlersInitialized);

// Let's see if we can manually initialize
try {
  // This might be called internally when the server connects
  console.log('🚀 Trying to access internal initialization...');

  // Check if there are any methods to get tools list
  console.log('📋 Available methods on inner server:');
  console.log(Object.getOwnPropertyNames(innerServer).filter(name => !name.startsWith('_')));

} catch (error) {
  console.error('❌ Error:', error);
}