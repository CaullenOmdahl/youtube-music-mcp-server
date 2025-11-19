# Complete Examples

## Table of Contents
- [Minimal Complete Example](#minimal-complete-example)
- [Tool Examples](#tool-examples)
- [Prompt Examples](#prompt-examples)
- [Resource Examples](#resource-examples)
- [Common Patterns](#common-patterns)

## Minimal Complete Example

### Project Structure

```
your-mcp-server/
├── icon.svg
├── package.json
├── smithery.yaml
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── tools/
│   │   └── main.ts
│   └── prompts/
│       └── workflows.ts
```

### src/types.ts

```typescript
import { z } from 'zod';

export const configSchema = z.object({
  apiKey: z.string().optional()
    .describe("API key (optional if API_KEY env var is set)"),
  format: z.enum(['json', 'markdown']).default('markdown')
    .describe("Output format")
});

export type Config = z.infer<typeof configSchema>;
```

### src/index.ts

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { Config } from './types.js';
import { configSchema } from './types.js';
import { registerTools } from './tools/main.js';
import { registerWorkflowPrompts } from './prompts/workflows.js';

export { configSchema };

export default function createServer(config?: Config) {
  const server = new McpServer({
    name: 'your-server',
    version: '1.0.0'
  });

  const apiKey = config?.apiKey ?? process.env.API_KEY;
  const format = config?.format ?? 'markdown';

  registerTools(server, { apiKey, format });
  registerWorkflowPrompts(server);

  return server;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
```

### package.json

```json
{
  "name": "your-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "your-mcp-server": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "npx @smithery/cli build",
    "lint": "tsc --noEmit",
    "prebuild": "npm run lint",
    "inspector": "npx @modelcontextprotocol/inspector dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "smithery": "^0.4.0",
    "tsx": "^4.7.2",
    "typescript": "^5.4.5"
  }
}
```

### smithery.yaml

```yaml
runtime: "typescript"
# No configSchema - auto-detected from TypeScript export
```

## Tool Examples

### Read-Only Tool

```typescript
server.registerTool(
  'get_status',
  {
    title: 'Get Status',
    description: 'Retrieves current status of a resource. ' +
                 'Returns immediately with current state.',
    inputSchema: {
      resourceId: z.string()
        .describe('Unique identifier for the resource')
    },
    outputSchema: {
      id: z.string(),
      status: z.enum(['active', 'inactive', 'pending']),
      lastUpdated: z.string().describe('ISO 8601 timestamp')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ resourceId }) => {
    const result = await fetchStatus(resourceId);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);
```

### Create Tool

```typescript
server.registerTool(
  'create_resource',
  {
    title: 'Create Resource',
    description: 'Creates a new resource with the specified configuration. ' +
                 'Returns immediately with resource ID. ' +
                 'Use get_status to check if resource is ready.',
    inputSchema: {
      name: z.string().min(1).max(100)
        .describe('Resource name (1-100 characters)'),
      type: z.enum(['typeA', 'typeB'])
        .describe('Resource type'),
      config: z.record(z.string())
        .describe('Configuration key-value pairs')
    },
    outputSchema: {
      id: z.string().describe('Unique resource identifier'),
      status: z.string(),
      createdAt: z.string()
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,  // Each call creates new resource
      openWorldHint: false
    }
  },
  async ({ name, type, config }) => {
    const result = await createResource(name, type, config);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);
```

### Delete Tool

```typescript
server.registerTool(
  'delete_resource',
  {
    title: 'Delete Resource',
    description: 'Permanently deletes a resource. ' +
                 'This action cannot be undone. ' +
                 'Returns confirmation of deletion.',
    inputSchema: {
      resourceId: z.string()
        .describe('ID of resource to delete')
    },
    outputSchema: {
      deleted: z.boolean(),
      deletedAt: z.string()
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,   // DELETES DATA
      idempotentHint: true,    // Safe to retry
      openWorldHint: false
    }
  },
  async ({ resourceId }) => {
    const result = await deleteResource(resourceId);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);
```

## Prompt Examples

### Getting Started Prompt

```typescript
server.registerPrompt(
  'getting-started',
  {
    title: 'Getting Started Guide',
    description: 'Step-by-step setup for first-time users',
    argsSchema: {}
  },
  async () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `I'll help you get started with the service.

Here's what we'll cover:
1. Verify API authentication
2. Create your first resource
3. Check resource status
4. Next steps

Let's start by checking your authentication...`
      }
    }]
  })
);
```

### Workflow with Parameters

```typescript
server.registerPrompt(
  'create-and-deploy',
  {
    title: 'Create and Deploy',
    description: 'Complete workflow to create and deploy a resource',
    argsSchema: {
      name: z.string()
        .describe('Name for the new resource'),
      environment: z.string()
        .describe('Target environment (staging or production)').optional()
    }
  },
  async ({ name, environment }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Let's create and deploy "${name}" to ${environment || 'staging'}.

Steps:
1. Create the resource with create_resource tool
2. Wait for it to be ready (poll get_status)
3. Deploy to ${environment || 'staging'}
4. Verify deployment

Starting with resource creation...`
      }
    }]
  })
);
```

### Troubleshooting Prompt

```typescript
server.registerPrompt(
  'troubleshoot',
  {
    title: 'Troubleshoot Issue',
    description: 'Diagnose and fix common problems',
    argsSchema: {
      resourceId: z.string()
        .describe('ID of resource having issues')
    }
  },
  async ({ resourceId }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Let's troubleshoot the issue with resource ${resourceId}.

Diagnostic steps:
1. Get current status
2. Check logs for errors
3. Verify configuration
4. Identify and fix the problem

Starting with status check...`
      }
    }]
  })
);
```

## Resource Examples

### Documentation Resource

```typescript
server.registerResource(
  'yourservice://docs/getting-started',
  {
    title: 'Getting Started',
    description: 'Quick start guide',
    mimeType: 'text/plain'
  },
  async () => ({
    contents: [{
      uri: 'yourservice://docs/getting-started',
      text: `# Getting Started

## Authentication
Set your API key in config or API_KEY env var.

## Basic Usage
1. Create a resource with create_resource
2. Check status with get_status
3. Delete with delete_resource

## Examples
...`,
      mimeType: 'text/plain'
    }]
  })
);
```

### Dynamic Documentation (Fetched)

```typescript
let cachedDocs: string | null = null;
let cacheTime = 0;
const CACHE_DURATION = 3600000; // 1 hour

server.registerResource(
  'yourservice://docs/api',
  {
    title: 'API Documentation',
    description: 'Complete API reference',
    mimeType: 'text/plain'
  },
  async () => {
    const now = Date.now();

    if (!cachedDocs || (now - cacheTime) > CACHE_DURATION) {
      const response = await fetch('https://docs.yourservice.com/llms.txt');
      cachedDocs = await response.text();
      cacheTime = now;
    }

    return {
      contents: [{
        uri: 'yourservice://docs/api',
        text: cachedDocs,
        mimeType: 'text/plain'
      }]
    };
  }
);
```

## Common Patterns

### Async Operations with Status

```typescript
// Create (returns immediately)
server.registerTool('operation_create', {
  description: 'Starts async operation. Returns ID immediately. ' +
               'Use operation_status to monitor.',
  annotations: { idempotentHint: false }
  // ...
});

// Status (poll until complete)
server.registerTool('operation_status', {
  description: 'Check operation status. ' +
               'Poll every 5-10 seconds until "completed" or "failed".',
  annotations: { readOnlyHint: true, idempotentHint: false }
  // ...
});

// Cancel
server.registerTool('operation_cancel', {
  description: 'Cancel running operation. Idempotent - safe to retry.',
  annotations: { destructiveHint: true, idempotentHint: true }
  // ...
});
```

### Flexible Output Format

```typescript
server.registerTool('get_data', {
  inputSchema: {
    id: z.string(),
    format: z.enum(['json', 'markdown', 'table']).describe('Output format')
  }
}, async ({ id, format }) => {
  const data = await fetchData(id);

  let text: string;
  switch (format) {
    case 'json':
      text = JSON.stringify(data, null, 2);
      break;
    case 'markdown':
      text = formatAsMarkdown(data);
      break;
    case 'table':
      text = formatAsTable(data);
      break;
  }

  return {
    content: [{ type: 'text', text }]
  };
});
```

### Parent-Child Resources

```typescript
// List parents
server.registerTool('project_list', {
  outputSchema: {
    projects: z.array(z.object({
      id: z.string(),
      name: z.string()
    }))
  }
});

// List children (requires parent ID)
server.registerTool('build_list', {
  inputSchema: {
    projectId: z.string()
      .describe('Parent project ID from project_list')
  },
  outputSchema: {
    builds: z.array(z.object({
      id: z.string(),
      status: z.string()
    }))
  }
});
```
