// Debug the MCP server creation issue
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

console.log("Creating minimal MCP server for testing...");

const configSchema = z.object({
  debug: z.boolean().default(false).describe("Enable debug logging"),
  cookies: z.string().describe("YouTube Music cookies for authentication"),
});

function createMinimalMcpServer({ config }) {
  console.log("Creating server with config:", config);

  const server = new McpServer({
    name: "Test YouTube Music Manager",
    version: "1.0.0",
  });

  // Add a simple test tool that doesn't require initialization
  server.registerTool(
    "test_tool",
    {
      title: "Test Tool",
      description: "A simple test tool that always works",
      inputSchema: z.object({}),
    },
    async () => {
      return {
        content: [{
          type: "text",
          text: `✅ Test tool works! Debug: ${config.debug}, Cookies length: ${config.cookies?.length || 0}`
        }],
      };
    }
  );

  console.log("Server created successfully");
  return server.server;
}

try {
  const testConfig = {
    debug: true,
    cookies: "test-cookie-string"
  };

  const server = createMinimalMcpServer({ config: testConfig });
  console.log("✅ Minimal server creation successful");
  console.log("Server object exists:", !!server);

} catch (error) {
  console.error("❌ Server creation failed:", error);
}