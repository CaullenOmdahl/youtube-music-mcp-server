import { ReccoBeatsClient } from './src/reccobeats/client.js';
import { SpotifyClient } from './src/spotify/client.js';
import { config } from './src/config.js';

async function testReccoBeats() {
  console.log('Testing ReccoBeats API Integration...\n');

  const spotify = new SpotifyClient();
  const reccobeats = new ReccoBeatsClient();

  try {
    // Step 1: Search for track on Spotify to get Spotify ID
    console.log('1. Searching Spotify for "Let It Happen" by Tame Impala...');
    const track = await spotify.searchTrack('Let It Happen', 'Tame Impala');

    if (!track) {
      console.log('   ❌ Track not found on Spotify');
      return;
    }

    console.log('   ✅ Track found:', track.name);
    console.log('   Spotify ID:', track.id);
    console.log('   Artists:', track.artists.map((a) => a.name).join(', '));
    console.log('   Popularity:', track.popularity, '\n');

    // Step 2: Get audio features from ReccoBeats using Spotify ID
    console.log('2. Getting audio features from ReccoBeats...');
    console.log('   Endpoint: GET /v1/track/' + track.id + '/audio-features');

    const features = await reccobeats.getAudioFeatures(track.id);

    if (!features) {
      console.log('   ❌ No audio features returned from ReccoBeats');
      return;
    }

    console.log('   ✅ Audio features retrieved:');
    console.log('      Tempo:', features.tempo, 'BPM');
    console.log('      Energy:', features.energy);
    console.log('      Valence:', features.valence, '(musical positivity)');
    console.log('      Danceability:', features.danceability);
    console.log('      Acousticness:', features.acousticness);
    console.log('      Instrumentalness:', features.instrumentalness);
    console.log('      Speechiness:', features.speechiness);
    console.log('      Loudness:', features.loudness, 'dB');

    console.log('\n✅ ReccoBeats integration successful!');
    console.log('   This can replace the deprecated Spotify audio features endpoint.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

testReccoBeats();
