import StreamSourceClient from './streamSourceClient.js';
import { config, validateConfig } from './lib/config.js';
import { log, delay } from './lib/utils.js';
import { checkStreamStatus } from './lib/streamChecker.js';
import { archiveExpiredStreams, shouldRunArchive } from './lib/streamArchiver.js';
import { prioritizeStreams } from './lib/streamPrioritizer.js';

// Validate configuration
validateConfig();

// Initialize StreamSource client
const streamSourceClient = new StreamSourceClient({
  apiUrl: config.STREAMSOURCE_API_URL,
  email: config.STREAMSOURCE_EMAIL,
  password: config.STREAMSOURCE_PASSWORD
}, { log, error: log });

// State
let lastArchiveCheck = 0;

/**
 * Fetch all active streams from StreamSource
 * @returns {Promise<Array>} Array of stream objects
 */
async function fetchActiveStreams() {
  log('Fetching streams from StreamSource...');
  const allStreams = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await streamSourceClient.getStreams({
      page,
      per_page: 100,
      is_archived: false
    });

    allStreams.push(...response.streams);
    hasMore = page < response.meta.total_pages;
    page++;
  }

  log(`Fetched ${allStreams.length} active streams`);
  return allStreams;
}

/**
 * Update stream status in StreamSource
 * @param {number} streamId - Stream ID
 * @param {string} status - New status
 */
async function updateStreamStatus(streamId, status) {
  try {
    await streamSourceClient.updateStreamStatus(streamId, status);
  } catch (error) {
    log(`Failed to update stream ${streamId}:`, error.message);
  }
}

/**
 * Main processing loop
 */
async function processStreams() {
  try {
    // Fetch all active streams
    const streams = await fetchActiveStreams();

    // Prioritize streams for checking
    const prioritizedStreams = prioritizeStreams(streams);

    // Check each stream
    const updates = [];
    for (const stream of prioritizedStreams) {
      const result = await checkStreamStatus(stream, config.RATE_LIVE, config.RATE_OFF);
      if (result) {
        updates.push(result);
      }
    }

    // Update all statuses
    if (updates.length > 0) {
      log(`Updating ${updates.length} stream statuses...`);
      for (const update of updates) {
        await updateStreamStatus(update.streamId, update.status);
      }
    }

    // Check if we should run the archive process
    if (shouldRunArchive(config.ARCHIVE_ENABLED, lastArchiveCheck, config.ARCHIVE_CHECK_INTERVAL)) {
      await archiveExpiredStreams(streamSourceClient, config.ARCHIVE_THRESHOLD_MINUTES);
      lastArchiveCheck = Date.now();
    }

  } catch (error) {
    log('Processing error:', error.message);
    
    // Re-authenticate if needed
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      log('Re-authenticating...');
      try {
        await streamSourceClient.authenticate();
      } catch (authError) {
        log('Re-authentication failed:', authError.message);
      }
    }
    
    throw error;
  }
}

/**
 * Main application entry point
 */
async function main() {
  log(`StreamSource Live Checker started`);
  log(`Check rates - Live: ${config.RATE_LIVE/1000}s, Offline: ${config.RATE_OFF/1000}s`);

  // Authenticate on startup
  await streamSourceClient.authenticate();
  log('Connected to StreamSource API');

  // Main loop
  while (true) {
    try {
      await processStreams();
      
      const sleepTime = config.LOOP_DELAY_MIN + Math.random() * (config.LOOP_DELAY_MAX - config.LOOP_DELAY_MIN);
      log(`Cycle complete — sleeping ${(sleepTime / 1000).toFixed(0)}s`);
      await delay(sleepTime);
      
    } catch (error) {
      log('Main loop error:', error.message);
      await delay(30000); // Wait 30s on error
    }
  }
}

// Start the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});