import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn } from "child_process";

async function testHttpServer() {
  console.log("Starting HTTP MCP server test...");

  // Start the server process
  const serverProcess = spawn("node", [".smithery/index.cjs"], {
    env: {
      ...process.env,
      PORT: "8081"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (data) => {
    console.log("Server:", data.toString().trim());
  });

  serverProcess.stderr.on("data", (data) => {
    console.error("Server Error:", data.toString().trim());
  });

  // Wait for server to start
  console.log("Waiting for server to start...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Connect via HTTP transport
    const transport = new StreamableHTTPClientTransport(
      "http://localhost:8081/mcp?debug=true&cookies=test-cookie-value"
    );

    const client = new Client({
      name: "test-client",
      version: "1.0.0"
    });

    console.log("Connecting to HTTP server...");
    await client.connect(transport);

    console.log("Connected! Listing tools...");
    const result = await client.listTools();

    console.log("Tools found:", result.tools.length);
    result.tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name}: ${tool.description}`);
    });

    await client.close();
    console.log("HTTP test completed successfully!");

  } catch (error) {
    console.error("HTTP test failed:", error);
  } finally {
    serverProcess.kill();
    console.log("Server process terminated");
  }
}

testHttpServer();