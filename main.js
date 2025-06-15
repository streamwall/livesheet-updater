// Thin wrapper that imports from src/ for backward compatibility
import { createApp as createAppCore, cleanUrl, isValidLiveUrl, getPlatform, getCheckRateForPriority } from './src/app.js';
import { attachMainLoop } from './src/index.js';

// Re-export all constants for backward compatibility
export {
  MINUTE,
  HOUR,
  RATE_LIVE,
  RATE_OFF,
  RECENTLY_LIVE_THRESHOLD,
  BASE_CHECK_RATE,
  MIN_CHECK_RATE,
  MAX_CHECK_RATE,
  PRIORITY_ALWAYS_CHECK,
  MAX_KNOWN_STREAMERS_PER_CYCLE,
  LOOP_DELAY_MIN,
  LOOP_DELAY_MAX,
  ERROR_RETRY_DELAY,
  PRIORITY_GROUP_HIGH,
  PRIORITY_GROUP_MID,
  PRIORITY_GROUP_LOW,
  DEFAULT_HEADERS
} from './src/config/constants.js';

// Re-export utility functions
export { cleanUrl, isValidLiveUrl, getPlatform, getCheckRateForPriority };

// Re-export createApp with main loop attached
export function createApp(deps) {
  const app = createAppCore(deps);
  return attachMainLoop(app, deps);
}

// Default entry point - only runs if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  import('fs/promises').then(({ default: fs }) => 
    import('google-auth-library').then(({ GoogleAuth }) =>
      import('google-spreadsheet').then(({ GoogleSpreadsheet }) => {
        const deps = { fs, GoogleAuth, GoogleSpreadsheet, fetch, console, process, setTimeout, Date };
        const app = createApp(deps);
        app.initialize().then(() => app.main());
      })
    )
  );
}