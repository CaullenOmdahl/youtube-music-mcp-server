const https = require('https');

// Test if we can use OAuth Bearer token with YouTube Music internal API
const accessToken = process.argv[2];

if (!accessToken) {
  console.error('Usage: node test-ytmusic-oauth.cjs <access_token>');
  process.exit(1);
}

const data = JSON.stringify({
  context: {
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: '1.20251117.03.00',
    },
  },
});

const options = {
  hostname: 'music.youtube.com',
  port: 443,
  path: '/youtubei/v1/browse?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Authorization': `Bearer ${accessToken}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://music.youtube.com',
    'X-Youtube-Client-Name': '67',
    'X-Youtube-Client-Version': '1.20251117.03.00',
  },
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('\nResponse:');
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch (e) {
      console.log(body);
    }
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
});

req.write(data);
req.end();
