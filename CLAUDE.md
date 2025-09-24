# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build and Test
```bash
# Build the server for production (uses Smithery CLI)
npm run build

# Run development server (requires Smithery API key)
npm run dev

# Test server locally after build
node test-local.js

# Test server can be created without errors
node -e "import('./.smithery/index.cjs').then(mod => { console.log('✅ Server loads successfully'); }).catch(err => { console.error('❌ Error:', err); process.exit(1); });"
```

### Deployment Process
**ALWAYS follow this process before pushing:**
1. Build: `npm run build`
2. Test locally: `node test-local.js`
3. Only then commit and push (Smithery auto-deploys from GitHub)
4. Wait ~120 seconds for Smithery deployment to complete

## Architecture

### MCP Server Architecture
The server follows the Model Context Protocol (MCP) pattern with stateless configuration:

- **Entry Point**: `src/index.ts` exports `createMcpServer` function and `configSchema` (Zod schema)
- **Stateless Server**: Marked with `export const stateless = true` for Smithery
- **Configuration**: Session-level config passed via `configSchema`, validated by Zod
- **Tool Registration**: Uses `server.tool(name, inputSchema, handler)` pattern

### YouTube Music Integration
Two-layer API approach for redundancy:
- **ytmusic-api**: Public search API (no auth required, read-only)
- **youtube-music-ts-api**: Authenticated API for playlist creation
- **Cookie Authentication**: Required for write operations, passed via Smithery config

### Key Components
- **YouTubeMusicClient** (`src/youtube-music-client.ts`): Manages both API layers, handles auth
- **PlaylistCurator** (`src/curation.ts`): AI-powered playlist generation logic
- **AuthManager** (`src/auth.ts`): Cookie persistence (currently unused in stateless mode)

### Smithery Bundling Considerations
- Zod schemas in tool definitions must use `as any` cast to avoid bundler issues
- Import youtube-music-ts-api using `require()` pattern for bundler compatibility
- Config schema MUST be exported as Zod object for Smithery validation

## Configuration

### smithery.yaml Structure
```yaml
runtime: typescript
config:
  cookies:
    type: string
    required: true
    sensitive: true
    description: "YouTube Music authentication cookies"
  debug:
    type: boolean
    default: false
```

### Config Schema (src/index.ts)
```typescript
export const configSchema = z.object({
  cookies: z.string().describe("YouTube Music cookies from music.youtube.com"),
  debug: z.boolean().optional().default(false)
});
```

## Common Issues and Solutions

### "schema.safeParse is not a function"
- Smithery expects exported `configSchema` to be a Zod schema
- Don't export plain JSON schemas at module level

### "import_youtube_music_ts_api.default is not a constructor"
- Use `require()` pattern: `const YTMusicApiAuth = require("youtube-music-ts-api").default || require("youtube-music-ts-api");`

### "Session not found or expired"
- Server must export `const stateless = true` for stateless operation
- Or implement proper session management for stateful mode

### Authentication Issues
- Cookies must be provided through Smithery config when connecting MCP server
- Format: semicolon-separated string from browser cookies
- Required cookies: __Secure-1PSID, __Secure-1PAPISID, SAPISID, etc.