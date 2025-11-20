import { SpotifyClient } from './src/spotify/client.js';
import { config } from './src/config.js';

async function testSpotify() {
  console.log('Testing Spotify API...');
  console.log('Client ID configured:', !!config.spotifyClientId);
  console.log('Client Secret configured:', !!config.spotifyClientSecret);

  const spotify = new SpotifyClient();

  try {
    // Test search for a known track
    console.log('\n1. Testing track search...');
    const track = await spotify.searchTrack('Let It Happen', 'Tame Impala');
    console.log('Found track:', !!track);
    if (track) {
      console.log('Track:', track.name, 'by', track.artists[0].name);
      console.log('Spotify ID:', track.id);
      console.log('Popularity:', track.popularity);

      // Test getting audio features
      console.log('\n2. Testing audio features...');
      const features = await spotify.getAudioFeatures(track.id);
      console.log('Audio features:', {
        tempo: features.tempo,
        energy: features.energy,
        valence: features.valence,
        danceability: features.danceability,
        acousticness: features.acousticness,
        mode: features.mode === 1 ? 'major' : 'minor'
      });

      console.log('\n✅ Spotify API is working!');
    }
  } catch (error) {
    console.error('\n❌ Spotify API test failed:', error);
    throw error;
  }
}

testSpotify();
