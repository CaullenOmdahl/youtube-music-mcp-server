# Claude Development Notes

## Build and Test Process

**ALWAYS follow this process before pushing changes:**

1. **Build Test**
   ```bash
   npm run build
   ```
   - Verify build completes successfully
   - Check for TypeScript compilation errors
   - Ensure no dependency issues

2. **Functionality Test**
   ```bash
   # Test server creation (create minimal test if needed)
   node -e "
   import('./src/index.js').then(mod => {
     const server = mod.default({ config: { debug: true, cookies: 'test' } });
     console.log('✅ Server creation works');
   }).catch(err => {
     console.error('❌ Server creation failed:', err);
     process.exit(1);
   });"
   ```

3. **Only then commit and push**
   ```bash
   git add -A
   git commit -m "..."
   git push
   ```

## Project Structure

- **src/index.ts** - Main MCP server entry point
- **src/youtube-music-client.ts** - YouTube Music API wrapper
- **src/types.ts** - TypeScript type definitions
- **src/curation.ts** - Playlist generation logic
- **smithery.yaml** - Smithery deployment configuration

## Testing Commands

- `npm run build` - Build the server
- `npm run dev` - Run in development mode (requires Smithery API key)

## Key Requirements

- Cookies are required for all functionality
- Server must work with Smithery's deployment platform
- All tools should be visible when properly configured
- Must create actual playlists in YouTube Music accounts