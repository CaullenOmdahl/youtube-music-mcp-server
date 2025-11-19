# Schema Format Requirements

## Table of Contents
- [The Most Important Rule](#the-most-important-rule)
- [Why This Matters](#why-this-matters)
- [Correct Format Examples](#correct-format-examples)
- [Common Mistakes](#common-mistakes)
- [Parameter Description Issues](#parameter-description-issues)

## The Most Important Rule

Smithery expects **ZodRawShape** (plain objects with Zod properties), NOT **ZodObject** (the result of `z.object()`).

### Wrong Format

```typescript
// This will cause tools to be INVISIBLE (shows as "0/0 tools")
server.registerTool(
  'tool_name',
  {
    title: 'Tool Title',
    description: 'Tool description',
    inputSchema: z.object({              // WRONG!
      param: z.string().describe('...')
    }).strict(),
    outputSchema: z.object({             // WRONG!
      result: z.string()
    })
  },
  async (input) => { ... }
);
```

### Correct Format

```typescript
// This will be properly detected by Smithery
server.registerTool(
  'tool_name',
  {
    title: 'Tool Title',
    description: 'Tool description',
    inputSchema: {                       // CORRECT!
      param: z.string().describe('...')
    },
    outputSchema: {                      // CORRECT!
      result: z.string()
    }
  },
  async (input) => { ... }
);
```

## Why This Matters

The MCP SDK's `zodToJsonSchema` function expects:
- **ZodRawShape**: A plain object with Zod properties `{ param: z.string() }`
- **NOT ZodObject**: The result of `z.object({...})` or `z.object({...}).strict()`

If you use `z.object()`, the tools won't be detected by Smithery's quality scanner, resulting in a "0/0 tools" score.

## Correct Format Examples

### Tools

```typescript
server.registerTool(
  'build_create',
  {
    title: 'Create Build',
    description: 'Triggers a new build...',
    inputSchema: {
      platform: z.enum(['ios', 'android', 'all'])
        .describe('Target platform'),
      profile: z.string()
        .describe('Build profile (e.g., development, production)')
    },
    outputSchema: {
      buildId: z.string(),
      status: z.string()
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async (args) => {
    // Implementation
  }
);
```

### Prompts

```typescript
server.registerPrompt('workflow-name', {
  title: 'Workflow Title',
  description: 'Description',
  argsSchema: {                    // Plain object!
    arg: z.string()
  }
});
```

### Reusable Schemas

You CAN still define reusable schemas using `z.object()` for type inference and validation - just don't use them directly in `inputSchema`/`outputSchema`:

```typescript
// Define reusable schema (this is fine)
const BuildResultSchema = z.object({
  buildId: z.string(),
  status: z.string()
});

// Use the schema's shape for outputSchema
server.registerTool('build_create', {
  // ...
  outputSchema: BuildResultSchema.shape,  // Extract the shape
  // Or just inline it:
  // outputSchema: {
  //   buildId: z.string(),
  //   status: z.string()
  // }
});
```

## Common Mistakes

### Mistake 1: Wrapping in z.object()

```typescript
// WRONG
inputSchema: z.object({
  param: z.string()
})

// CORRECT
inputSchema: {
  param: z.string()
}
```

### Mistake 2: Using .strict()

```typescript
// WRONG
inputSchema: z.object({
  param: z.string()
}).strict()

// CORRECT
inputSchema: {
  param: z.string()
}
```

### Mistake 3: Prompts with z.object()

```typescript
// WRONG
argsSchema: z.object({
  arg: z.string()
})

// CORRECT
argsSchema: {
  arg: z.string()
}
```

## Parameter Description Issues

Smithery may not detect parameter descriptions when `.optional()` or `.default()` modifiers are present.

### Problem

```typescript
// Descriptions may not be detected
inputSchema: {
  limit: z.number().describe("Max results").optional().default(5),
  query: z.string().describe("Search query").optional()
}
```

### Solution

Remove modifiers and handle defaults in the handler:

```typescript
// Descriptions will be detected
inputSchema: {
  limit: z.number().min(1).max(20).describe("Max results (default: 5)"),
  query: z.string().describe("Search query")
}

// Handle defaults in handler
async (args) => {
  const limit = args?.limit ?? 5;
  // ...
}
```

## Finding and Fixing Schema Issues

### Search for Problems

```bash
# Find z.object() usage in schemas
grep -r "z.object(" src/tools/
grep -r "z.object(" src/prompts/

# Should NOT find any in inputSchema/outputSchema/argsSchema
```

### Automated Fix Script

```python
#!/usr/bin/env python3
import re
from pathlib import Path

def fix_schema(content):
    # Pattern: inputSchema: z.object({...}).strict()
    pattern = r'(inputSchema|outputSchema|argsSchema):\s*z\.object\(\{([^}]+)\}\)(?:\.strict\(\))?'

    def replace_schema(match):
        schema_name = match.group(1)
        schema_body = match.group(2)
        return f'{schema_name}: {{{schema_body}}}'

    return re.sub(pattern, replace_schema, content, flags=re.MULTILINE | re.DOTALL)

# Process all TypeScript files in src/
for file_path in Path('src').rglob('*.ts'):
    content = file_path.read_text()
    fixed = fix_schema(content)
    if fixed != content:
        file_path.write_text(fixed)
        print(f"Fixed: {file_path}")
```

## Verification

After fixing schemas:

1. Build: `npm run build`
2. Test with MCP Inspector: `npx @modelcontextprotocol/inspector dist/index.js`
3. Call `tools/list` - verify all tools appear
4. Check tool JSON includes proper `inputSchema` structure
