import got from 'got';
import dotenv from 'dotenv';

dotenv.config();

async function testSpotifyAudioFeatures() {
  console.log('Testing Spotify Audio Features API...\n');

  // Step 1: Get access token
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  console.log('1. Getting access token...');
  console.log('   Client ID configured:', !!clientId);
  console.log('   Client Secret configured:', !!clientSecret);

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const tokenResponse = await got.post('https://accounts.spotify.com/api/token', {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      responseType: 'json',
    });

    const { access_token } = tokenResponse.body;
    console.log('   ✅ Access token obtained\n');

    // Step 2: Search for a track
    console.log('2. Searching for track "Let It Happen" by "Tame Impala"...');
    const searchResponse = await got.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
      searchParams: {
        q: 'track:Let It Happen artist:Tame Impala',
        type: 'track',
        limit: 1,
      },
      responseType: 'json',
    });

    const track = searchResponse.body.tracks.items[0];
    console.log('   ✅ Track found:', track.name);
    console.log('   Track ID:', track.id);
    console.log('   Artists:', track.artists.map(a => a.name).join(', '));
    console.log('   Popularity:', track.popularity, '\n');

    // Step 3: Get audio features
    console.log('3. Getting audio features for track ID:', track.id);
    console.log('   Making request to: https://api.spotify.com/v1/audio-features/' + track.id);

    try {
      const featuresResponse = await got.get(`https://api.spotify.com/v1/audio-features/${track.id}`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
        responseType: 'json',
        throwHttpErrors: false, // Don't throw on non-2xx to see the response
      });

      console.log('   Status Code:', featuresResponse.statusCode);
      console.log('   Status Message:', featuresResponse.statusMessage);

      if (featuresResponse.statusCode === 200) {
        const features = featuresResponse.body;
        console.log('   ✅ Audio features retrieved:');
        console.log('      Tempo:', features.tempo, 'BPM');
        console.log('      Energy:', features.energy);
        console.log('      Valence:', features.valence);
        console.log('      Danceability:', features.danceability);
        console.log('      Acousticness:', features.acousticness);
        console.log('      Mode:', features.mode === 1 ? 'Major' : 'Minor');
      } else {
        console.log('   ❌ Failed with status:', featuresResponse.statusCode);
        console.log('   Response body:', JSON.stringify(featuresResponse.body, null, 2));
      }
    } catch (error) {
      console.log('   ❌ Audio features request failed');
      console.log('   Error code:', error.code);
      console.log('   Error message:', error.message);
      if (error.response) {
        console.log('   Response status:', error.response.statusCode);
        console.log('   Response body:', JSON.stringify(error.response.body, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.statusCode);
      console.error('Response body:', JSON.stringify(error.response.body, null, 2));
    }
  }
}

testSpotifyAudioFeatures();
