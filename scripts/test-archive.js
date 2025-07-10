import StreamSourceClient from './lib/streamSourceClient.js';

// Test script for StreamSource archiving functionality
async function test() {
  console.log('Testing StreamSource archiving functionality...\n');

  // Check environment variables
  const config = {
    apiUrl: process.env.STREAMSOURCE_API_URL || 'https://api.streamsource.com',
    email: process.env.STREAMSOURCE_EMAIL,
    password: process.env.STREAMSOURCE_PASSWORD
  };

  if (!config.email || !config.password) {
    console.error('Error: STREAMSOURCE_EMAIL and STREAMSOURCE_PASSWORD must be set');
    console.error('Usage: STREAMSOURCE_EMAIL=email STREAMSOURCE_PASSWORD=pass node test-archive.js');
    process.exit(1);
  }

  const logger = {
    log: (...args) => console.log(new Date().toISOString(), ...args),
    error: (...args) => console.error(new Date().toISOString(), 'ERROR:', ...args)
  };

  try {
    // Create client
    const client = new StreamSourceClient(config, logger);

    // Test authentication
    console.log('1. Testing authentication...');
    await client.authenticate();
    console.log('✅ Authentication successful\n');

    // Test fetching streams
    console.log('2. Testing stream fetching...');
    const response = await client.getStreams({ page: 1, per_page: 5 });
    console.log(`✅ Found ${response.meta.total_count} total streams`);
    console.log(`   Showing first ${response.streams.length} streams:`);
    response.streams.forEach(stream => {
      console.log(`   - ${stream.id}: ${stream.link} (${stream.status})`);
    });
    console.log('');

    // Test finding expired streams
    console.log('3. Testing expired stream detection...');
    const thresholdMinutes = parseInt(process.env.TEST_THRESHOLD_MINUTES || '15');
    console.log(`   Using threshold: ${thresholdMinutes} minutes`);
    const expiredStreams = await client.getExpiredOfflineStreams(thresholdMinutes);
    console.log(`✅ Found ${expiredStreams.length} expired offline streams`);
    
    if (expiredStreams.length > 0) {
      console.log('   Expired streams:');
      expiredStreams.forEach(stream => {
        const lastLive = stream.last_live_at ? new Date(stream.last_live_at) : new Date(stream.updated_at);
        const ageMinutes = ((new Date() - lastLive) / 60000).toFixed(1);
        console.log(`   - ${stream.id}: ${stream.link} (offline for ${ageMinutes} min)`);
      });
    }
    console.log('');

    // Test archiving (dry run by default)
    if (process.env.TEST_ARCHIVE === 'true' && expiredStreams.length > 0) {
      console.log('4. Testing stream archiving...');
      const streamToArchive = expiredStreams[0];
      console.log(`   Archiving stream ${streamToArchive.id}: ${streamToArchive.link}`);
      
      try {
        await client.archiveStream(streamToArchive.id);
        console.log('✅ Successfully archived stream\n');
      } catch (error) {
        console.error('❌ Failed to archive stream:', error.message);
      }
    } else if (expiredStreams.length > 0) {
      console.log('4. Archiving test skipped (set TEST_ARCHIVE=true to test archiving)');
    }

    console.log('All tests completed successfully!');

  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

test();