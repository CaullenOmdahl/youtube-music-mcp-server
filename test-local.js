import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testServer() {
  console.log("Starting MCP server test...");

  try {
    // Start the server with node
    const transport = new StdioClientTransport({
      command: "node",
      args: [".smithery/index.cjs"],
      env: {
        ...process.env,
        MCP_CONFIG: JSON.stringify({
          debug: true,
          cookies: "test-cookie-value"
        })
      }
    });

    const client = new Client({
      name: "test-client",
      version: "1.0.0"
    });

    console.log("Connecting to server...");
    await client.connect(transport);

    console.log("Connected! Listing tools...");
    const result = await client.listTools();

    console.log("Tools found:", result.tools.length);
    result.tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name}: ${tool.description}`);
    });

    await client.close();
    console.log("Test completed successfully!");

  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testServer();