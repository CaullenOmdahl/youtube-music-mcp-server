# Quality Scoring Guide

## Table of Contents
- [Scoring Breakdown](#scoring-breakdown)
- [Tools with Descriptions (25 points)](#tools-with-descriptions-25-points)
- [Tool Annotations (20 points)](#tool-annotations-20-points)
- [Configuration Points](#configuration-points)
- [Workflow Prompts (15 points)](#workflow-prompts-15-points)
- [Icon (10 points)](#icon-10-points)
- [Documentation (5 points)](#documentation-5-points)

## Scoring Breakdown

Smithery uses a 0-100 point quality scoring system:

| Feature | Points | How to Achieve |
|---------|--------|----------------|
| Tools with descriptions | 25 | Provide detailed descriptions for all tools |
| Tool annotations | 20 | Add readOnlyHint, destructiveHint, idempotentHint |
| Optional config | 15 | Make all config fields optional or have defaults |
| Workflow prompts | 15 | Add 3-5 workflow prompts for common tasks |
| Icon | 10 | Include icon.svg or icon.png in repository root |
| Config schema | 10 | Only if config is REQUIRED (mutually exclusive with optional) |
| Documentation | 5 | Include comprehensive README |

**Maximum achievable: 90/100** with optional config (best UX)
**Alternative: 85/100** with required config (worse UX)

## Tools with Descriptions (25 points)

### Requirements
- Every tool must have a detailed description
- Descriptions should be 2-4 sentences
- Must explain what the tool does, its behavior, and related tools

### Good Description Template

```typescript
description: 'Triggers a new build for the specified platform and profile. ' +
             'This is a non-blocking operation that returns a build ID for tracking. ' +
             'Use build_status to check progress. Typical build time: 10-20 minutes.'
```

### Description Guidelines

1. **Start with action verb**: "Triggers", "Lists", "Cancels", "Retrieves"
2. **Explain behavior**: Non-blocking? Async? Returns immediately?
3. **Mention related tools**: "Use X to check progress"
4. **Include timing info**: "Typical build time: 10-20 minutes"

### Parameter Descriptions

```typescript
inputSchema: {
  // GOOD: Specific with examples
  profile: z.string()
    .describe('Build profile name (e.g., development, preview, production)'),

  // GOOD: Explains defaults and alternatives
  apiToken: z.string()
    .describe('API token for authentication (optional if EXPO_TOKEN env var is set)'),

  // GOOD: Clear constraints
  timeout: z.number().min(0).max(3600)
    .describe('Timeout in seconds (0-3600, default: 300)')
}
```

## Tool Annotations (20 points)

### Placement (Critical!)

Annotations MUST be inside the config object, NOT as a 4th parameter:

```typescript
// WRONG - Will not be detected
server.registerTool(
  'tool_name',
  { title, description, inputSchema, outputSchema },
  { readOnlyHint: true, ... },  // 4th parameter - WRONG!
  async () => {}
);

// CORRECT - Inside config object
server.registerTool(
  'tool_name',
  {
    title: 'Tool Title',
    description: 'Description',
    inputSchema: { ... },
    outputSchema: { ... },
    annotations: {              // Inside config - CORRECT!
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {}
);
```

### Annotation Meanings

| Annotation | Meaning | Example Use |
|------------|---------|-------------|
| `readOnlyHint` | Tool only reads, doesn't modify | List, Get, Status tools |
| `destructiveHint` | Tool deletes/destroys data | Delete, Cancel tools |
| `idempotentHint` | Same input = same result | Status check, Retry-safe ops |
| `openWorldHint` | Non-deterministic results | Search, weather, random |

### Decision Tree

```
readOnlyHint:
  Does this tool modify any state? (files, DB, API)
    YES → false
    NO  → true

destructiveHint:
  Does this tool delete or destroy data?
    YES → true
    NO  → false

idempotentHint:
  If I call this twice with same input, is result same?
    YES → true
    NO  → false

openWorldHint:
  Does this return non-deterministic results?
    YES → true
    NO  → false
```

### Examples by Tool Type

```typescript
// Read-only info tool
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}

// Create new resource
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,  // Each call creates new
  openWorldHint: false
}

// Delete resource
annotations: {
  readOnlyHint: false,
  destructiveHint: true,  // Destroys data!
  idempotentHint: true,   // Safe to retry
  openWorldHint: false
}

// Search/query (live data)
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,  // Results change
  openWorldHint: true     // Non-deterministic
}
```

## Configuration Points

### Mutually Exclusive Paths

**Path 1: Optional Config (15 points)** - RECOMMENDED
- All config fields are optional or have defaults
- Best UX: Server works without any setup
- Maximum score: 90/100

**Path 2: Required Config (10 points)** - Not recommended
- At least one field is required
- Worse UX: Requires mandatory configuration
- Maximum score: 85/100

### Implementing Optional Config

```typescript
// src/types.ts
export const configSchema = z.object({
  apiToken: z.string().optional()
    .describe("API token (can also use API_TOKEN env var)"),
  defaultFormat: z.enum(["json", "markdown"]).default("markdown")
    .describe("Default output format")
});

// src/index.ts
export default function createServer(config?: Config) {
  const server = new McpServer({ name: 'your-server', version: '1.0.0' });

  // Use config with fallbacks
  const apiToken = config?.apiToken ?? process.env.API_TOKEN;

  return server;
}
```

### Build Output Verification

```
> Config schema: 2 fields (0 required)
```

- "0 required" → Optional Config (15pts)
- "1+ required" → Config Schema (10pts)

## Workflow Prompts (15 points)

### Requirements
- Need 3-5 workflow prompts
- Each should be an end-to-end workflow
- Cover common user journeys

### Example Workflow Prompts

```typescript
export function registerWorkflowPrompts(server: McpServer) {
  // Prompt 1: Quick start
  server.registerPrompt('quick-start', {
    title: 'Quick Start Guide',
    description: 'Get started with your first project',
    argsSchema: {
      projectName: z.string().describe('Name for your new project')
    }
  }, async ({ projectName }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Let's set up "${projectName}"...`
      }
    }]
  }));

  // Prompt 2: Deploy workflow
  server.registerPrompt('deploy', {
    title: 'Deploy to Production',
    description: 'Full deployment workflow',
    argsSchema: {
      environment: z.string().describe('staging or production').optional()
    }
  }, async ({ environment }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Deploying to ${environment || 'staging'}...`
      }
    }]
  }));

  // Add 1-3 more prompts
}
```

### Prompt Ideas by Domain

**Build/Deploy Services:**
- create-new-project
- deploy-to-production
- troubleshoot-build

**API Services:**
- getting-started
- handle-authentication
- debug-api-errors

**Data Services:**
- import-data
- export-report
- troubleshoot-connection

## Icon (10 points)

### Requirements
- File: `icon.svg` or `icon.png`
- Location: Repository root (NOT in src/)
- SVG preferred for scalability
- Minimum 512x512px for PNG

### Quick SVG Template

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="256" cy="256" r="240" fill="url(#grad)"/>
  <text x="256" y="340" font-family="Arial, sans-serif" font-size="240"
        fill="white" text-anchor="middle" font-weight="bold">S</text>
</svg>
```

## Documentation (5 points)

### Requirements
- Comprehensive README.md
- Should include:
  - What the server does
  - Installation instructions
  - Configuration options
  - Usage examples
  - API reference

## Score Progression

Expected progression when fixing issues:

1. **Initial: 43/100** - Basic tools, wrong schema format
2. **After schemas: 60-70/100** - Tools detected
3. **After annotations: 75-80/100** - Tools + annotations
4. **After icon + prompts: 90/100** - Complete implementation
