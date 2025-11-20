const fs = require('fs');
const readline = require('readline');

const harFile = process.argv[2] || 'harharhar/music.youtube.com.har';

console.log(`Analyzing: ${harFile} (streaming mode for large files)\n`);

// Read file size
const stats = fs.statSync(harFile);
console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);

// Parse the HAR file
const harContent = fs.readFileSync(harFile, 'utf8');
const harData = JSON.parse(harContent);

console.log('='.repeat(80));
console.log('ANALYZING YOUTUBE MUSIC API REQUESTS');
console.log('='.repeat(80));

const endpoints = new Map();
const timings = [];
let hasRateLimitHeaders = false;

for (const entry of harData.log.entries) {
  const url = entry.request.url;

  // Only analyze YouTubei API calls (the actual API, not assets)
  if (url.includes('/youtubei/v1/')) {
    const urlObj = new URL(url);
    const endpoint = urlObj.pathname;

    if (!endpoints.has(endpoint)) {
      endpoints.set(endpoint, {
        count: 0,
        method: entry.request.method,
        statuses: [],
      });
    }

    const ep = endpoints.get(endpoint);
    ep.count++;
    ep.statuses.push(entry.response.status);

    // Check for rate limit headers
    const responseHeaders = entry.response.headers;
    for (const header of responseHeaders) {
      const name = header.name.toLowerCase();
      if (name.includes('rate') || name.includes('limit') ||
        name.includes('quota') || name.includes('retry')) {
        hasRateLimitHeaders = true;
        console.log(`\n⚠️  RATE LIMIT HEADER FOUND:`);
        console.log(`   Endpoint: ${endpoint}`);
        console.log(`   Header: ${header.name}: ${header.value}`);
      }
    }

    // Collect timing data
    timings.push({
      endpoint,
      timestamp: new Date(entry.startedDateTime).getTime(),
      duration: entry.time,
    });
  }
}

console.log('\n' + '='.repeat(80));
console.log('API ENDPOINTS USED');
console.log('='.repeat(80));

const sortedEndpoints = [...endpoints.entries()].sort((a, b) => b[1].count - a[1].count);

for (const [endpoint, data] of sortedEndpoints) {
  console.log(`\n${endpoint}`);
  console.log(`  Method: ${data.method}`);
  console.log(`  Count: ${data.count}`);
  const uniqueStatuses = [...new Set(data.statuses)];
  console.log(`  Statuses: ${uniqueStatuses.join(', ')}`);
}

console.log('\n' + '='.repeat(80));
console.log('TIMING & CONCURRENCY ANALYSIS');
console.log('='.repeat(80));

if (timings.length > 0) {
  timings.sort((a, b) => a.timestamp - b.timestamp);

  // Find max requests in different time windows
  const windows = [
    { ms: 1000, label: '1 second' },
    { ms: 10000, label: '10 seconds' },
    { ms: 60000, label: '1 minute' },
  ];

  console.log('\nBurst analysis (max requests in sliding window):');
  for (const window of windows) {
    let maxInWindow = 0;

    for (let i = 0; i < timings.length; i++) {
      const windowStart = timings[i].timestamp;
      const windowEnd = windowStart + window.ms;

      const count = timings.filter(t =>
        t.timestamp >= windowStart && t.timestamp < windowEnd
      ).length;

      maxInWindow = Math.max(maxInWindow, count);
    }

    console.log(`  Max in ${window.label}: ${maxInWindow} requests`);
  }

  // Calculate request rate
  if (timings.length > 1) {
    const duration = (timings[timings.length - 1].timestamp - timings[0].timestamp) / 1000;
    const rate = timings.length / duration;
    console.log(`\nOverall rate: ${rate.toFixed(2)} requests/second over ${duration.toFixed(1)}s`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('CONCLUSIONS & RECOMMENDATIONS');
console.log('='.repeat(80));

if (!hasRateLimitHeaders) {
  console.log('\n✅ NO EXPLICIT RATE LIMIT HEADERS FOUND');
  console.log('\nThis suggests:');
  console.log('  1. Google/YouTube Music does NOT return explicit rate limit headers');
  console.log('  2. Rate limiting is likely enforced server-side silently');
  console.log('  3. Limits may be based on IP, user account, or other factors');
  console.log('\nRecommendations:');
  console.log('  - Our client-side rate limiting IS necessary');
  console.log('  - Use conservative limits based on observed burst patterns above');
  console.log('  - Current limits (60/min, 10 burst) may be conservative or aggressive');
  console.log('  - Monitor production logs for actual throttling');
} else {
  console.log('\n⚠️  RATE LIMIT HEADERS DETECTED (see above)');
  console.log('\nRecommendations:');
  console.log('  - Adjust rate limits based on header values');
  console.log('  - Implement exponential backoff on rate limit responses');
}

console.log('\n' + '='.repeat(80));
