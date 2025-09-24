import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Test what Smithery expects - very simple server
export const configSchema = z.object({
  debug: z.boolean().default(false),
  cookies: z.string().optional(),
});

export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
  console.log('🏗️ Creating MCP server...');

  const server = new McpServer({
    name: "YouTube Music Manager",
    version: "1.0.0",
  });

  console.log('📋 Registering tools...');

  // Register a simple test tool first
  server.registerTool(
    "test_tool",
    {
      title: "Test Tool",
      description: "Simple test tool to verify server works",
      inputSchema: z.object({
        message: z.string().describe("Test message")
      }),
    },
    async (args) => {
      return {
        content: [{ type: "text", text: `Test successful! Message: ${args.message}` }]
      };
    }
  );

  // Register search tool
  server.registerTool(
    "search",
    {
      title: "Search YouTube Music",
      description: "Search for songs, artists, albums, or playlists on YouTube Music",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        type: z.enum(['songs', 'artists', 'albums', 'playlists', 'all']).default('all'),
        limit: z.number().min(1).max(50).default(10)
      }),
    },
    async (args) => {
      return {
        content: [{ type: "text", text: `Search for "${args.query}" (${args.type}) - limit ${args.limit}\n\nThis is a test response. Tools are working!` }]
      };
    }
  );

  console.log('✅ Tools registered successfully');
  console.log('🎯 Returning server object...');

  // Test both return options
  console.log('Server type:', typeof server);
  console.log('Server.server type:', typeof server.server);
  console.log('Server properties:', Object.keys(server));

  // Return the server itself, not server.server
  return server.server;
}

// Quick test
const config = configSchema.parse({ debug: true });
const testServer = createServer({ config });
console.log('Final server object type:', typeof testServer);
console.log('Final server properties:', Object.keys(testServer));