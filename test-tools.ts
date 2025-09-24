import createServer, { configSchema } from './src/index.js';

async function testMCPTools() {
    console.log('🔧 Testing MCP Server Tools...\n');

    try {
        // Test with debug config and actual cookies
        const config = configSchema.parse({
            debug: true,
            cookies: "VISITOR_INFO1_LIVE=JYiVNjcmCRY; VISITOR_PRIVACY_METADATA=REDACTED; _gcl_au=1.1.2013901205.1756905558; SID=REDACTED; __Secure-1PSID=REDACTED; __Secure-3PSID=REDACTED; HSID=REDACTED; SSID=REDACTED; APISID=REDACTED; SAPISID=REDACTED; __Secure-1PAPISID=REDACTED; __Secure-3PAPISID=REDACTED; YSC=mip-xjrR1-I; LOGIN_INFO=REDACTED:QUQ3MjNmeE55TFZqeDNFWS1nNk9sMDI3MTYtYnJTT0Q0UjRYTWU3Vk5KVUxOMWJKcjZKVng1eE9uWXpkQXFBZlF5RzA5eXZCT1JKdERkelA1cG9tZlJGdUxDMkpDd3NTYmFBMHZId1Z1am81Si1MVURmU0NjV1NKVWE0YjllZ3B6QU9rVjRZN2wwek1icUtuSnZzV0RUNDdxUUZNdHg1VkJB; PREF=f6=80&tz=Asia.Saigon&f5=20000&f7=100&f4=10000&repeat=NONE&volume=53&autoplay=true; __Secure-ROLLOUT_TOKEN=CKagkJzMhPa03QEQ5cbU-Ke0jwMYl9ytlKvxjwM%3D; __Secure-1PSIDTS=REDACTED; __Secure-3PSIDTS=REDACTED; SIDCC=REDACTED; __Secure-1PSIDCC=REDACTED; __Secure-3PSIDCC=REDACTED"
        });

        console.log('🏗️  Creating MCP server...');
        const mcpServer = createServer({ config });

        console.log('✅ MCP Server created');

        // Test tools/list method
        console.log('🔍 Testing tools/list request...');

        try {
            const toolsListRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            };

            console.log('📤 Sending request:', JSON.stringify(toolsListRequest, null, 2));

            // Call the request method
            const response = await mcpServer.request(toolsListRequest);

            console.log('📥 Response received:', JSON.stringify(response, null, 2));

            if (response && response.result && response.result.tools) {
                console.log(`🎉 Found ${response.result.tools.length} tools!`);
                response.result.tools.forEach((tool: any, index: number) => {
                    console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
                });
            } else {
                console.log('❌ No tools found in response');
            }

        } catch (requestError) {
            console.error('❌ Error making tools/list request:', requestError);
        }

        // Also try initialize first
        console.log('\n🤝 Testing full MCP initialization flow...');

        try {
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

            const initResponse = await mcpServer.request(initRequest);
            console.log('✅ Initialize response:', JSON.stringify(initResponse, null, 2));

            // Now try tools/list after initialization
            const toolsResponse = await mcpServer.request({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            });

            console.log('📋 Tools after init:', JSON.stringify(toolsResponse, null, 2));

        } catch (error) {
            console.error('❌ Error in init flow:', error);
        }

    } catch (error) {
        console.error('💥 Error in test:', error);
        console.error('Stack:', error.stack);
    }

    console.log('\n🏁 Tools test completed');
}

testMCPTools();