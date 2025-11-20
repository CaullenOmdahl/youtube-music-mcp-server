import { ReccoBeatsClient } from './src/reccobeats/client.js';
import { SpotifyClient } from './src/spotify/client.js';

async function testReccoBeatsRecommendations() {
    console.log('Testing ReccoBeats Recommendations...\n');

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

        // Step 2: Get recommendations from ReccoBeats using Spotify ID
        console.log('\n2. Getting recommendations from ReccoBeats...');
        console.log('   Seed Track:', track.id);
        console.log('   Target Valence: 0.8 (Happy)');
        console.log('   Target Energy: 0.7 (Energetic)');

        const recommendations = await reccobeats.getRecommendations({
            seed_tracks: [track.id],
            target_valence: 0.8,
            target_energy: 0.7,
            limit: 5,
        });

        if (recommendations.length === 0) {
            console.log('   ❌ No recommendations returned from ReccoBeats');
            return;
        }

        console.log(`   ✅ Retrieved ${recommendations.length} recommendations:`);
        recommendations.forEach((rec, index) => {
            console.log(`      ${index + 1}. ${rec.title} - ${rec.artist}`);
            console.log(`         Album: ${rec.album}`);
            console.log(`         Duration: ${rec.duration}`);
        });

        console.log('\n✅ ReccoBeats recommendation integration successful!');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        throw error;
    }
}

testReccoBeatsRecommendations();
