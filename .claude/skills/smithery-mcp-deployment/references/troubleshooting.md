# Troubleshooting Guide

## Table of Contents
- [Diagnostic Workflow](#diagnostic-workflow)
- [Issue: 0/0 Tools](#issue-00-tools)
- [Issue: Missing Annotations](#issue-missing-annotations)
- [Issue: Missing Icon](#issue-missing-icon)
- [Issue: Parameter Descriptions Not Detected](#issue-parameter-descriptions-not-detected)
- [TypeScript Errors](#typescript-errors)
- [Deployment Failures](#deployment-failures)

## Diagnostic Workflow

### Step 1: Check Current Score

1. Go to your server on smithery.ai
2. Note your quality score (e.g., 43/100)
3. Check what's detected:
   - Tools: X/Y tools
   - Config schema: Present/Missing
   - Icon: Present/Missing
   - Prompts: X prompts

### Step 2: Use Decision Tree

```
Is your score < 60?
├─ YES → Schema format issue (see "0/0 Tools")
└─ NO → Continue

Is your score 60-70?
├─ YES → Missing annotations
└─ NO → Continue

Is your score 70-85?
├─ YES → Missing icon or prompts
└─ NO → Continue

Is your score 85-90?
├─ YES → Need workflow prompts
└─ NO → You're at optimal (90/100)
```

## Issue: 0/0 Tools

### Symptoms
- Quality score: ~43/100
- Smithery shows "0/0 tools"
- Build succeeds locally
- Console shows "Config schema: N fields"

### Root Cause
Using `z.object()` wrapper instead of plain objects.

### Fix

**Find the problem:**
```bash
grep -r "z.object(" src/tools/
grep -r "z.object(" src/prompts/
```

**Convert each occurrence:**

Before:
```typescript
inputSchema: z.object({
  param: z.string()
}).strict()
```

After:
```typescript
inputSchema: {
  param: z.string()
}
```

### Verification

```bash
npm run build
npx @modelcontextprotocol/inspector dist/index.js
# Call tools/list - should see all tools
```

## Issue: Missing Annotations

### Symptoms
- Score: 60-70/100
- Tools are detected
- But annotations not being recognized

### Root Cause
Annotations passed as 4th parameter instead of inside config object.

### How to Check

Call `tools/list` via MCP Inspector. If `annotations` is missing from JSON:

```json
{
  "tools": [{
    "name": "tool_name",
    "inputSchema": { ... }
    // No "annotations" field = not working
  }]
}
```

### Fix

**Wrong:**
```typescript
server.registerTool(
  'tool_name',
  { title, description, inputSchema, outputSchema },
  { readOnlyHint: true, ... },  // 4th param - WRONG!
  async () => {}
);
```

**Correct:**
```typescript
server.registerTool(
  'tool_name',
  {
    title: '...',
    description: '...',
    inputSchema: { ... },
    outputSchema: { ... },
    annotations: {              // Inside config!
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {}
);
```

## Issue: Missing Icon

### Symptoms
- Score missing 10 points
- Smithery shows "Missing icon"

### Fix

1. Create icon:
   - SVG preferred (scalable)
   - PNG acceptable (512x512px minimum)

2. Place in repository ROOT:
   ```
   your-mcp-server/
   ├── icon.svg    <- Here (NOT in src/)
   └── src/
   ```

3. Deploy:
   ```bash
   git add icon.svg
   git commit -m "Add server icon"
   git push
   ```

## Issue: Parameter Descriptions Not Detected

### Symptoms
- Tools detected but shows "9/16 parameters"
- Some parameter descriptions not counted

### Root Cause
`.optional()` or `.default()` modifiers interfere with description detection.

### Fix

Remove modifiers from schema, handle defaults in handler:

**Before:**
```typescript
inputSchema: {
  limit: z.number().describe("Max results").optional().default(5)
}
```

**After:**
```typescript
inputSchema: {
  limit: z.number().min(1).max(20).describe("Max results (default: 5)")
}

// Handle in handler:
async (args) => {
  const limit = args?.limit ?? 5;
}
```

## TypeScript Errors

### Error: `request.params` undefined

**Cause:** Using old handler pattern with plain object schemas.

**Fix:**
```typescript
// WRONG
async (request) => {
  const args = request.params?.arguments as MyArgs;
}

// CORRECT - Args passed directly
async (args: MyArgs) => {
  // args is already typed and available
}
```

### Error: Resource callback return type

**Cause:** Wrong return format for resources.

**Fix:**
```typescript
// WRONG
async () => ({
  text: content
})

// CORRECT
async () => ({
  contents: [{
    uri: "docs://resource",
    text: content,
    mimeType: "text/plain"
  }]
})
```

### Error: Prompt argsSchema type

**Cause:** Using non-string types in prompt argsSchema.

**Fix:**
```typescript
// WRONG
argsSchema: {
  useFeature: z.boolean().default(true),
  mode: z.enum(['fast', 'slow'])
}

// CORRECT - Strings only
argsSchema: {
  useFeature: z.string().describe("true or false").optional(),
  mode: z.string().describe("fast or slow").optional()
}

// Parse in handler:
async (args) => {
  const useFeature = args.useFeature !== 'false';
  const mode = args.mode || 'fast';
}
```

## Deployment Failures

### Error: configSchema in smithery.yaml

**Cause:** For TypeScript runtime, configSchema is auto-detected from export.

**Fix:**
```yaml
# WRONG
runtime: "typescript"
configSchema:
  type: "object"
  properties:
    apiToken:
      type: "string"

# CORRECT - Let it auto-detect
runtime: "typescript"
```

Export from TypeScript instead:
```typescript
// src/index.ts
export const configSchema = z.object({
  apiToken: z.string().optional()
});
```

### Error: Build fails after schema changes

**Cause:** Import paths or module issues.

**Check:**
```bash
npm run build 2>&1 | grep "Cannot find module"
```

**Common fix:** TypeScript ESM requires explicit `.js` extensions:
```typescript
import { foo } from './utils.js';  // Correct
import { foo } from './utils';      // Wrong in ESM
```

## General Debugging Checklist

- [ ] Run `npm run build` locally
- [ ] Check for "Config schema: N fields"
- [ ] Run MCP Inspector
- [ ] Call `tools/list` - all tools appear?
- [ ] Check JSON - annotations present?
- [ ] Verify `icon.svg` in repo root
- [ ] Count workflow prompts (need 3-5)
- [ ] Check smithery.yaml (no configSchema for TS)
- [ ] Git push all files
- [ ] Wait 3-5 minutes for Smithery rebuild

## Quick Fixes Summary

| Issue | Fix |
|-------|-----|
| Schema format | Use plain objects, not `z.object()` |
| Annotations | Move inside config object |
| Missing icon | Add icon.svg to repo root |
| Need prompts | Create 3-5 in prompts/ |
| Config not detected | Export from index.ts |
| Can't test | `npx @modelcontextprotocol/inspector dist/index.js` |
