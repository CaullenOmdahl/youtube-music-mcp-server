# Migration Guide

## Table of Contents
- [Pre-Migration Assessment](#pre-migration-assessment)
- [Migration Steps](#migration-steps)
- [Before and After Examples](#before-and-after-examples)
- [Migration Checklist](#migration-checklist)

## Pre-Migration Assessment

### Check Your Current Server

Before starting, assess your existing MCP server:

```bash
# 1. Schema format
grep -r "z.object(" src/
# If results found → Need to migrate schemas

# 2. Annotations
grep -r "annotations:" src/
# If no results → Need to add annotations

# 3. Icon
ls icon.svg icon.png 2>/dev/null
# If not found → Need to add icon

# 4. Prompts
grep -r "registerPrompt" src/
# Count results - need 3-5 prompts

# 5. Config export
grep "export.*configSchema" src/index.ts
# If not found → Need to export config
```

## Migration Steps

### Step 1: Fix Schema Format (Critical!)

This is the most important change.

**Before (old format):**
```typescript
server.registerTool('my_tool', {
  description: 'My tool',
  inputSchema: z.object({
    param: z.string()
  }).strict()
});
```

**After (Smithery-compatible):**
```typescript
server.registerTool('my_tool', {
  title: 'My Tool',  // Add title
  description: 'My tool does X. Use with Y for Z.',  // Expand description
  inputSchema: {     // Plain object, not z.object()
    param: z.string()
      .describe('Detailed parameter description')
  },
  outputSchema: {    // Add output schema
    result: z.string()
  }
});
```

### Step 2: Add Tool Annotations

Add annotations to every tool based on its behavior:

```typescript
// Read-only tool
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}

// Create tool
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
}

// Delete tool
annotations: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
}
```

### Step 3: Enhance Descriptions

Improve all tool descriptions:

**Before:**
```typescript
description: 'Creates a build'
```

**After:**
```typescript
description: 'Triggers a new cloud build for the specified platform. ' +
             'This is an asynchronous operation that returns immediately. ' +
             'Use build_status to monitor progress.'
```

### Step 4: Add Workflow Prompts

Create `src/prompts/workflows.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerWorkflowPrompts(server: McpServer) {
  server.registerPrompt('getting-started', {
    title: 'Getting Started',
    description: 'Step-by-step setup guide',
    argsSchema: {}
  }, async () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Getting started guide...`
      }
    }]
  }));

  // Add 2-4 more prompts
}
```

Register in your main server:
```typescript
import { registerWorkflowPrompts } from './prompts/workflows.js';

export default function createServer(config) {
  // ...
  registerWorkflowPrompts(server);
  return server;
}
```

### Step 5: Add Icon

Create or generate an icon:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5" />
      <stop offset="100%" style="stop-color:#7C3AED" />
    </linearGradient>
  </defs>
  <circle cx="256" cy="256" r="240" fill="url(#grad)"/>
  <text x="256" y="340" font-family="Arial" font-size="200"
        fill="white" text-anchor="middle" font-weight="bold">X</text>
</svg>
```

Save as `icon.svg` in repository ROOT (not in src/).

### Step 6: Configure for Smithery

**Update package.json:**
```json
{
  "scripts": {
    "build": "npx @smithery/cli build",
    "lint": "tsc --noEmit",
    "prebuild": "npm run lint"
  }
}
```

**Create/update smithery.yaml:**
```yaml
runtime: "typescript"
# No configSchema for TypeScript - auto-detected
```

**Update src/index.ts:**
```typescript
export { configSchema } from './types.js';

export default function createServer(config) {
  // ...
}
```

### Step 7: Test Locally

```bash
# Install dependencies
npm install

# Lint
npm run lint

# Build
npm run build
# Check for: "Config schema: N fields (M required)"

# Test with MCP Inspector
npx @modelcontextprotocol/inspector dist/index.js
```

### Step 8: Deploy

```bash
git add .
git commit -m "Optimize for Smithery quality scoring"
git push
# Wait 2-3 minutes for Smithery rebuild
```

## Before and After Examples

### FastMCP to Smithery SDK

**Before (FastMCP - Python):**
```python
from fastmcp import FastMCP

mcp = FastMCP("My Server")

@mcp.tool()
def get_data(id: str) -> dict:
    """Get data by ID"""
    return fetch_data(id)
```

**After (Smithery SDK - TypeScript):**
```typescript
server.registerTool('get_data', {
  title: 'Get Data',
  description: 'Retrieves data by its unique identifier. ' +
               'Returns null if ID is not found.',
  inputSchema: {
    id: z.string()
      .describe('Unique identifier for the data record')
  },
  outputSchema: {
    data: z.object({
      id: z.string(),
      value: z.string()
    }).nullable()
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
}, async ({ id }) => {
  const data = await fetchData(id);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2)
    }]
  };
});
```

### Old SDK to Optimized

**Before:**
```typescript
server.registerTool('build', {
  description: 'Build app',
  inputSchema: z.object({
    platform: z.string()
  })
}, async (args) => {
  // ...
});
```

**After:**
```typescript
server.registerTool('build', {
  title: 'Create Build',
  description: 'Triggers a new application build for the specified platform. ' +
               'Returns a build ID immediately. Use build_status to monitor.',
  inputSchema: {
    platform: z.enum(['ios', 'android', 'all'])
      .describe('Target platform'),
    profile: z.string()
      .describe('Build profile (e.g., development, production)')
  },
  outputSchema: {
    buildId: z.string()
      .describe('Unique identifier for tracking'),
    status: z.string()
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }
}, async ({ platform, profile }) => {
  // ...
});
```

## Migration Checklist

Use this to track your migration:

- [ ] Run schema assessment commands
- [ ] Convert all `z.object()` to plain objects
- [ ] Add annotations to all tools
- [ ] Enhance all tool descriptions (2-4 sentences)
- [ ] Add parameter descriptions with examples
- [ ] Create 3-5 workflow prompts
- [ ] Add icon.svg to repo root
- [ ] Export configSchema from index.ts
- [ ] Update package.json with Smithery build
- [ ] Create/update smithery.yaml
- [ ] Run lint: `npx tsc --noEmit`
- [ ] Build: `npm run build`
- [ ] Test with MCP Inspector
- [ ] Verify tools/list shows annotations
- [ ] Commit and push
- [ ] Check Smithery quality score (target: 90/100)

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Quality Score | 30-50 | 90 |
| Tools Detected | 0/X | X/X |
| Annotations | None | All tools |
| Workflow Prompts | 0 | 3-5 |
| Icon | Missing | Present |
| Config Type | Varies | Optional |
