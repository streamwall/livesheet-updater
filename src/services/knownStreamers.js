/**
 * @fileoverview Service for monitoring known streamers and adding live ones to the main Livesheet
 * @module services/knownStreamers
 */

// Known streamers functionality
import { 
  MAX_KNOWN_STREAMERS_PER_CYCLE, 
  PRIORITY_GROUP_HIGH, 
  PRIORITY_GROUP_MID, 
  PRIORITY_GROUP_LOW,
  MS_PER_SECOND,
  COLUMN_NAMES,
  STATUS_LIVE,
  MINUTE
} from '../config/constants.js';
import { cleanUrl, isValidLiveUrl } from '../utils/url.js';
import { getCheckRateForPriority } from '../utils/priority.js';

export const createKnownStreamersService = (deps, logger, sheetHelpers, streamChecker) => {
  const { Date } = deps;
  const { log, debug } = logger;
  const { getField } = sheetHelpers;
  const { fetchUrlStatus } = streamChecker;
  
  // Map to track last check time for known streamers
  const knownStreamersLastCheck = new Map();
  
  // Check if a URL is already present in the Livesheet
  function isUrlInLivesheet(url, livesheetRows, sheet) {
    const cleaned = cleanUrl(url);
    return livesheetRows.some(row => {
      const rowUrl = getField(row, COLUMN_NAMES.LINK, sheet);
      return rowUrl && cleanUrl(rowUrl) === cleaned;
    });
  }

  // Check known streamers and add live ones to Livesheet
  async function checkKnownStreamers(sheet, knownStreamersSheet) {
    if (!knownStreamersSheet) {
      return;
    }
    
    try {
      const knownStreamers = await knownStreamersSheet.getRows();
      
      if (knownStreamers.length === 0) {
        log('No known streamers found in sheet');
        return;
      }
      
      const livesheetRows = await sheet.getRows();
      const now = Date.now();
      const nowIso = new Date().toISOString();
      let addedCount = 0;
      let checkedCount = 0;
      let skippedRateLimit = 0;
      let skippedInvalid = 0;
      let skippedAlreadyInLivesheet = 0;
      let offlineCount = 0;
      
      // Sort by priority (higher first) to ensure high priority streamers get checked first
      const sortedStreamers = knownStreamers.map((streamer, originalIdx) => {
        const priority = parseInt(getField(streamer, COLUMN_NAMES.PRIORITY, knownStreamersSheet)) || 0;
        return { streamer, priority, originalIdx };
      }).sort((a, b) => b.priority - a.priority);
      
      // Log priority distribution
      const priorityGroups = {};
      sortedStreamers.forEach(({ priority }) => {
        if (priority >= PRIORITY_GROUP_HIGH) {
          priorityGroups['100+'] = (priorityGroups['100+'] || 0) + 1;
        } else if (priority >= PRIORITY_GROUP_MID) {
          priorityGroups['10-99'] = (priorityGroups['10-99'] || 0) + 1;
        } else if (priority >= PRIORITY_GROUP_LOW) {
          priorityGroups['1-9'] = (priorityGroups['1-9'] || 0) + 1;
        } else {
          priorityGroups['0 or unset'] = (priorityGroups['0 or unset'] || 0) + 1;
        }
      });
      
      log(`Starting known streamers check: ${knownStreamers.length} total streamers`);
      log(`Priority distribution: ${JSON.stringify(priorityGroups)}`);
      
      for (let i = 0; i < sortedStreamers.length; i++) {
        const { streamer: knownStreamer, priority, originalIdx: idx } = sortedStreamers[i];
        const rawUrl = getField(knownStreamer, COLUMN_NAMES.URL, knownStreamersSheet);
        const source = getField(knownStreamer, COLUMN_NAMES.SOURCE, knownStreamersSheet);
        const city = getField(knownStreamer, COLUMN_NAMES.CITY, knownStreamersSheet);
        const state = getField(knownStreamer, COLUMN_NAMES.STATE, knownStreamersSheet);
        
        if (!rawUrl) {
          log(`[Known ${idx}] Skipping - no URL`);
          continue;
        }
        
        // Clean URL like in checkStatus
        const url = cleanUrl(rawUrl);
        
        // Validate URL
        if (!isValidLiveUrl(url)) {
          log(`[Known ${idx}] Skip invalid URL: ${url}`);
          skippedInvalid++;
          continue;
        }
        
        // Check rate limit for this streamer
        const lastCheck = knownStreamersLastCheck.get(url) || 0;
        const rate = getCheckRateForPriority(priority);
        
        if (now - lastCheck < rate) {
          const timeLeft = Math.round((rate - (now - lastCheck)) / MS_PER_SECOND);
          const rateMinutes = Math.round(rate / MINUTE);
          debug(`[Known ${idx}] Skip ${url} (priority ${priority}, checks every ${rateMinutes}m, ${timeLeft}s left)`);
          skippedRateLimit++;
          continue;
        }
        
        // Limit checks per cycle to avoid rate limiting
        if (checkedCount >= MAX_KNOWN_STREAMERS_PER_CYCLE) {
          debug(`[Known ${idx}] Skip ${url} - reached max checks per cycle (${MAX_KNOWN_STREAMERS_PER_CYCLE})`);
          skippedRateLimit++;
          continue;
        }
        
        knownStreamersLastCheck.set(url, now);
        
        // Check if already in Livesheet
        if (isUrlInLivesheet(url, livesheetRows, sheet)) {
          log(`[Known ${idx}] Already in Livesheet: ${url}`);
          skippedAlreadyInLivesheet++;
          continue;
        }
        
        // Check if streamer is live
        log(`[Known ${idx}] Checking priority ${priority}: ${url}`);
        checkedCount++;
        
        const result = await fetchUrlStatus(url);
        
        if (!result) {
          log(`[Known ${idx}] Failed to fetch status for ${url}`);
          continue;
        }
        
        if (result.status === STATUS_LIVE) {
          log(`[Known ${idx}] LIVE! Adding to Livesheet: ${url}`);
          
          // Add to Livesheet
          const newRow = await sheet.addRow({
            [COLUMN_NAMES.LINK]: url,
            [COLUMN_NAMES.PLATFORM]: result.platform,
            [COLUMN_NAMES.CITY]: city || '',
            [COLUMN_NAMES.STATE]: state || '',
            [COLUMN_NAMES.STATUS]: STATUS_LIVE,
            [COLUMN_NAMES.LAST_CHECKED]: nowIso,
            [COLUMN_NAMES.LAST_LIVE]: nowIso,
            [COLUMN_NAMES.ADDED_DATE]: nowIso,
            [COLUMN_NAMES.SOURCE]: source || ''
          });
          
          addedCount++;
          const sourceInfo = source ? ` from "${source}"` : '';
          log(`[Known ${idx}] Successfully added${sourceInfo}: ${url} (${city}, ${state})`);
        } else {
          debug(`[Known ${idx}] Offline: ${url}`);
          offlineCount++;
        }
      }
      
      // Log summary
      log(`Known streamers check complete:`);
      log(`  - Total streamers: ${knownStreamers.length}`);
      log(`  - Checked this cycle: ${checkedCount} (max ${MAX_KNOWN_STREAMERS_PER_CYCLE})`);
      log(`  - Added to Livesheet: ${addedCount}`);
      log(`  - Already in Livesheet: ${skippedAlreadyInLivesheet}`);
      log(`  - Offline: ${offlineCount}`);
      log(`  - Rate limited: ${skippedRateLimit}`);
      log(`  - Invalid URLs: ${skippedInvalid}`);
      
      if (checkedCount >= MAX_KNOWN_STREAMERS_PER_CYCLE) {
        log(`  - Note: Reached max checks per cycle. Remaining streamers will be checked next cycle.`);
      }
      
    } catch (e) {
      log('Known streamers check error:', e.message);
    }
  }
  
  return {
    isUrlInLivesheet,
    checkKnownStreamers,
    knownStreamersLastCheck
  };
};