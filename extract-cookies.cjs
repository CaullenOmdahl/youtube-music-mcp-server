const fs = require('fs');

// Read HAR file
const harData = JSON.parse(fs.readFileSync('/home/caullen/Downloads/music.youtube.com.har', 'utf8'));

// Find requests with cookies
const cookiesFound = new Set();

for (const entry of harData.log.entries) {
  // Check request headers
  for (const header of entry.request.headers) {
    if (header.name.toLowerCase() === 'cookie') {
      console.log('Found cookie header:');
      console.log(header.value);
      console.log('\n---\n');
      cookiesFound.add(header.value);
    }
  }

  // Check request cookies array
  if (entry.request.cookies && entry.request.cookies.length > 0) {
    console.log('Found cookies array:', entry.request.cookies);
  }
}

console.log(`\nTotal unique cookie strings found: ${cookiesFound.size}`);
