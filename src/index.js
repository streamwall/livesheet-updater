/**
 * @fileoverview Main application entry point and loop logic for the livestream checker
 * @module index
 */

// Main loop logic
import { 
  LOOP_DELAY_MIN, 
  LOOP_DELAY_MAX, 
  ERROR_RETRY_DELAY,
  RECENTLY_LIVE_THRESHOLD,
  MS_PER_SECOND,
  STATUS_LIVE,
  COLUMN_NAMES,
  ERROR_MESSAGES
} from './config/constants.js';

export function attachMainLoop(app, deps) {
  const { Date, process } = deps;
  const { 
    log, 
    debug, 
    delay,
    getField,
    checkStatus,
    batchUpdateRows,
    checkKnownStreamers,
    KNOWN_STREAMERS_ONLY
  } = app;
  
  async function main() {
    const mode = KNOWN_STREAMERS_ONLY ? 'Known Streamers Only' : 'Normal';
    log(`Live Checker started in ${mode} mode`);
    
    if (KNOWN_STREAMERS_ONLY && !app.getKnownStreamersSheet()) {
      log(ERROR_MESSAGES.KNOWN_STREAMERS_MODE_ERROR);
      process.exit(1);
    }

    while (true) {
      try {
        // Record cycle start time for race condition detection
        const cycleStartTime = Date.now();
        
        if (!KNOWN_STREAMERS_ONLY) {
          // Normal mode - check existing streams
          // Single read per cycle
          const sheet = app.getSheet();
          const rows = await sheet.getRows();
          log('Cycle start —', rows.length, 'rows fetched');

          const now = Date.now();
          const prioritized = rows.map((row, i) => ({ row, i })).sort((a, b) => {
            const getPriority = r => {
              if (!getField(r, COLUMN_NAMES.LAST_CHECKED)) return 3;
              if (getField(r, COLUMN_NAMES.STATUS)?.toLowerCase() === STATUS_LIVE.toLowerCase()) return 2;
              const lastLive = getField(r, COLUMN_NAMES.LAST_LIVE);
              if (lastLive && now - new Date(lastLive).getTime() <= RECENTLY_LIVE_THRESHOLD) return 1;
              return 0;
            };
            return getPriority(b.row) - getPriority(a.row);
          });

          if (prioritized.length > 0) {
            debug('Sample prioritized row:', sheet.headerValues.map((h, idx) => `${h}=${prioritized[0].row._rawData[idx]}`).join('; '))
          }

          // Check all streams
          for (const { row, i } of prioritized) {
            await checkStatus(row, i);
          }

          // Batch update all pending changes with race condition protection
          await batchUpdateRows(cycleStartTime);
        } else {
          // Known streamers only mode
          log('Cycle start — Known Streamers Only mode');
        }

        // Check known streamers (always runs, but is the only thing in known-only mode)
        await checkKnownStreamers();

        const sleepTime = LOOP_DELAY_MIN + Math.random() * (LOOP_DELAY_MAX - LOOP_DELAY_MIN);
        const sleepSeconds = Math.round(sleepTime / MS_PER_SECOND);
        log(`Cycle complete — sleeping ${sleepSeconds}s`);
        await delay(sleepTime);
        
      } catch (e) {
        log('Main loop error:', e.message);
        await delay(ERROR_RETRY_DELAY);
      }
    }
  }
  
  app.main = main;
  return app;
}