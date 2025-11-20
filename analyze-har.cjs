const fs = require('fs');

// Read HAR file
const harData = JSON.parse(fs.readFileSync('/home/caullen/Downloads/music.youtube.com.har', 'utf8'));

// Find API endpoints
const apiEndpoints = new Map();

for (const entry of harData.log.entries) {
  const url = entry.request.url;

  // Look for YouTube Music API calls
  if (url.includes('youtubei') || url.includes('music.youtube.com')) {
    const method = entry.request.method;
    const endpoint = url.replace(/\?.*$/, ''); // Remove query params

    const key = `${method} ${endpoint}`;
    if (!apiEndpoints.has(key)) {
      apiEndpoints.set(key, {
        method,
        url: endpoint,
        postData: entry.request.postData,
        headers: entry.request.headers.map(h => ({ name: h.name, value: h.value.substring(0, 100) })),
        responseStatus: entry.response.status,
      });
    }
  }
}

console.log('YouTube Music API Endpoints Found:\n');
for (const [key, data] of apiEndpoints.entries()) {
  console.log(`${key}`);
  console.log(`  Status: ${data.responseStatus}`);

  // Show interesting headers
  const authHeaders = data.headers.filter(h =>
    h.name.toLowerCase().includes('auth') ||
    h.name.toLowerCase().includes('key') ||
    h.name.toLowerCase() === 'x-goog-authuser' ||
    h.name.startsWith('x-')
  );
  if (authHeaders.length > 0) {
    console.log('  Auth/Key Headers:');
    authHeaders.forEach(h => console.log(`    ${h.name}: ${h.value}`));
  }

  if (data.postData && data.postData.text) {
    try {
      const body = JSON.parse(data.postData.text);
      console.log(`  Body keys: ${Object.keys(body).join(', ')}`);
    } catch (e) {
      // Not JSON
    }
  }
  console.log('');
}
