import { log, delay } from './utils.js';

/**
 * Archive expired offline streams
 * @param {StreamSourceClient} streamSourceClient - StreamSource API client
 * @param {number} thresholdMinutes - Minutes offline before archiving
 * @returns {Promise<Object>} Archive results
 */
export async function archiveExpiredStreams(streamSourceClient, thresholdMinutes) {
  if (!streamSourceClient) {
    throw new Error('StreamSource client is required for archiving');
  }
  
  try {
    log(`Checking for expired streams to archive (threshold: ${thresholdMinutes} minutes)`);
    
    // Get expired offline streams from StreamSource
    const expiredStreams = await streamSourceClient.getExpiredOfflineStreams(thresholdMinutes);
    
    if (expiredStreams.length === 0) {
      log('No expired streams found to archive');
      return { archivedCount: 0, errorCount: 0 };
    }
    
    log(`Found ${expiredStreams.length} expired streams to archive`);
    
    // Archive each stream
    let archivedCount = 0;
    let errorCount = 0;
    
    for (const stream of expiredStreams) {
      try {
        // Re-verify the stream is still offline before archiving
        // This helps prevent race conditions
        const currentTime = new Date();
        const lastLiveTime = stream.last_live_at ? new Date(stream.last_live_at) : new Date(stream.updated_at);
        const diffMinutes = (currentTime - lastLiveTime) / 60000;
        
        if ((stream.status !== 'offline' && stream.status !== 'unknown') || diffMinutes < thresholdMinutes) {
          log(`Stream ${stream.id} state changed, skipping archive`);
          continue;
        }
        
        await streamSourceClient.archiveStream(stream.id);
        archivedCount++;
        log(`Archived stream ${stream.id}: ${stream.link} (offline for ${diffMinutes.toFixed(1)} min)`);
        
        // Small delay between archives to avoid hammering the API
        await delay(100);
      } catch (error) {
        errorCount++;
        log(`Failed to archive stream ${stream.id}: ${error.message}`);
      }
    }
    
    log(`Archive complete: ${archivedCount} archived, ${errorCount} errors`);
    return { archivedCount, errorCount };
  } catch (error) {
    log('Error during archive process:', error.message);
    throw error;
  }
}

/**
 * Check if archiving should run based on configuration and timing
 * @param {boolean} archiveEnabled - Is archiving enabled
 * @param {number} lastArchiveCheck - Last archive check timestamp
 * @param {number} archiveCheckInterval - Interval between archive checks (ms)
 * @returns {boolean} True if archiving should run
 */
export function shouldRunArchive(archiveEnabled, lastArchiveCheck, archiveCheckInterval) {
  return archiveEnabled && Date.now() - lastArchiveCheck >= archiveCheckInterval;
}