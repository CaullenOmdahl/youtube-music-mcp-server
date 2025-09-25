import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

async function testAuthenticate() {
  console.log("Starting test of authenticate tool...");

  // Start the server as a child process
  const serverProcess = spawn("node", [".smithery/index.cjs"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env }
  });

  // Create a client
  const transport = new StdioClientTransport({
    stdin: serverProcess.stdin,
    stdout: serverProcess.stdout,
    stderr: serverProcess.stderr
  });

  const client = new Client({
    name: "test-client",
    version: "1.0.0"
  });

  try {
    // Connect to the server
    await client.connect(transport);
    console.log("✅ Connected to server");

    // List available tools
    const tools = await client.listTools();
    console.log("Available tools:", tools.tools.map(t => t.name));

    // Check if authenticate tool exists
    const authTool = tools.tools.find(t => t.name === "authenticate");
    if (authTool) {
      console.log("✅ Authenticate tool found");
      console.log("Tool schema:", JSON.stringify(authTool.inputSchema, null, 2));
    } else {
      console.log("❌ Authenticate tool not found!");
    }

    // Try to call authenticate with test cookies
    try {
      const result = await client.callTool({
        name: "authenticate",
        arguments: {
          cookies: "test_cookie=test_value"
        }
      });
      console.log("Authentication result:", result);
    } catch (error) {
      console.log("Expected error with test cookies:", error.message);
    }

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    // Clean up
    serverProcess.kill();
    await transport.close();
  }
}

testAuthenticate().catch(console.error);