import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createMcpServer({ config }: { config: any }) {
  const server = new McpServer({
    name: "Test Server",
    version: "1.0.0",
  });

  server.tool(
    {
      name: "test_tool",
      description: "Test tool",
      inputSchema: {
        type: "object",
        properties: {}
      } as any
    },
    async () => {
      return {
        content: [{ type: "text", text: "Test successful!" }],
      };
    }
  );

  return server.server;
}

export default createMcpServer;
export const stateless = true;