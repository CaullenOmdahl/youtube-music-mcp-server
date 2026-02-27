/**
 * Local OAuth authentication script.
 * Run once with: npm run auth
 * Opens your browser, you log in with Google, tokens are saved to disk.
 * Claude Desktop will use those tokens automatically on next start.
 */
import { createServer } from 'http';
import { randomBytes, createHash } from 'crypto';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env['GOOGLE_OAUTH_CLIENT_ID'] ?? '';
const CLIENT_SECRET = process.env['GOOGLE_OAUTH_CLIENT_SECRET'] ?? '';
const ENCRYPTION_KEY = process.env['ENCRYPTION_KEY'] ?? '';
const CALLBACK_PORT = 8082;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const TOKEN_PATH = process.env['TOKEN_STORAGE_PATH'] ??
  `${process.env['HOME'] ?? '/tmp'}/.youtube-music-mcp/tokens.json`;

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

// PKCE
const codeVerifier = randomBytes(32).toString('base64url');
const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

// Build authorization URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

// Encrypt tokens for storage (AES-256-GCM, same as token-store.ts)
import { createCipheriv, randomBytes as rb } from 'crypto';

function encryptTokens(data: object): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  const iv = rb(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(data);
  let encrypted = cipher.update(json, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${CALLBACK_PORT}`);
  if (!url.pathname.startsWith('/callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>❌ Auth failed: ${error ?? 'no code'}</h1>`);
    server.close();
    process.exit(1);
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    error?: string;
  };

  if (tokens.error || !tokens.access_token) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>❌ Token exchange failed: ${tokens.error}</h1>`);
    server.close();
    process.exit(1);
  }

  // Save tokens in the same format as token-store.ts
  const storedData = {
    tokens: [['local-session', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? '',
      expiresAt: Date.now() + tokens.expires_in * 1000,
    }]],
    currentSessionId: 'local-session',
    savedAt: new Date().toISOString(),
  };

  const encrypted = encryptTokens(storedData);
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await fs.writeFile(TOKEN_PATH, encrypted, 'utf8');

  console.log(`\n✅  Tokens saved to ${TOKEN_PATH}`);
  console.log('   Restart Claude Desktop to apply.\n');

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html><body style="font-family:sans-serif;text-align:center;padding:50px">
      <h1>✅ Authentication successful!</h1>
      <p>You can close this window and restart Claude Desktop.</p>
    </body></html>
  `);

  server.close();
  process.exit(0);
});

server.listen(CALLBACK_PORT, () => {
  console.log('\n🎵 YouTube Music MCP — Local Auth\n');
  console.log('Opening browser for Google authentication...');
  console.log('(If it does not open automatically, copy this URL:)');
  console.log(`\n  ${authUrl.toString()}\n`);
  exec(`open "${authUrl.toString()}"`);
});
