import createServer, { configSchema } from './src/index.js';

async function testMCPServer() {
    console.log('🧪 Testing MCP Server Tool Registration...\n');

    try {
        // Test with minimal configuration
        const config = configSchema.parse({
            debug: true,
            cookies: undefined  // Test without cookies first
        });

        console.log('📋 Config parsed successfully:', config);
        console.log('🏗️  Creating MCP server...');

        // Create the server
        const mcpServer = createServer({ config });

        console.log('✅ MCP Server created successfully!');

        // Try to access server methods
        console.log('🔍 Checking server object:', typeof mcpServer);
        console.log('📝 Server properties:', Object.keys(mcpServer));

        // Check if we can call MCP methods
        if (mcpServer && typeof mcpServer === 'object') {
            console.log('🎯 MCP Server appears to be valid');

            // Test a basic MCP protocol call
            try {
                // Simulate an initialize call like an MCP client would make
                const initRequest = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2025-06-18',
                        capabilities: {},
                        clientInfo: { name: 'test-client', version: '1.0.0' }
                    }
                };

                console.log('🤝 Testing server initialization...');

                // Check if server has request handler
                if (typeof mcpServer.request === 'function') {
                    console.log('✅ Server has request handler method');
                } else {
                    console.log('❌ Server missing request handler method');
                    console.log('Available methods:', Object.getOwnPropertyNames(mcpServer));
                }

            } catch (error) {
                console.error('❌ Error testing MCP calls:', error);
            }
        } else {
            console.error('❌ Invalid server object returned');
        }

    } catch (error) {
        console.error('💥 Error creating server:', error);
        console.error('Stack trace:', error.stack);
    }

    console.log('\n🏁 Test completed');
}

testMCPServer();