/**
 * @fileoverview Application factory that wires together all dependencies
 * @module app
 */

import { createLogger } from './utils/logger.js';
import { createSheetHelpers } from './utils/sheets.js';
import { createDelay } from './utils/delay.js';
import { createStreamChecker } from './services/streamChecker.js';
import { createBatchUpdater } from './services/batchUpdater.js';
import { createKnownStreamersService } from './services/knownStreamers.js';
import { createGoogleSheets } from './lib/googleSheets.js';
import { cleanUrl, isValidLiveUrl, getPlatform } from './utils/url.js';
import { getCheckRateForPriority } from './utils/priority.js';

// Re-export utilities for backward compatibility
export { cleanUrl, isValidLiveUrl, getPlatform } from './utils/url.js';
export { getCheckRateForPriority } from './utils/priority.js';

/**
 * Create the application instance with all dependencies wired together
 * @param {Object} deps - External dependencies
 * @param {Object} deps.fs - File system module
 * @param {Object} deps.GoogleAuth - Google Auth library
 * @param {Object} deps.GoogleSpreadsheet - Google Spreadsheet library
 * @param {Function} deps.fetch - Fetch function for HTTP requests
 * @param {Object} deps.console - Console for logging
 * @param {Object} deps.process - Process object for environment variables
 * @param {Function} deps.setTimeout - setTimeout function
 * @param {Object} deps.Date - Date constructor
 * @returns {Object} Application instance with all methods and configuration
 */
export function createApp(deps) {
  // Extract dependencies
  const { process } = deps;
  
  // Detect modes
  const KNOWN_STREAMERS_ONLY = process.env.KNOWN_STREAMERS_ONLY === 'true' || 
                               process.argv.includes('--known-only');
  
  // Create utilities
  const logger = createLogger(deps);
  const sheetHelpers = createSheetHelpers(logger);
  const delay = createDelay(deps.setTimeout);
  
  // Create services
  const streamChecker = createStreamChecker(deps, logger, sheetHelpers);
  const batchUpdater = createBatchUpdater(deps, logger, sheetHelpers);
  const knownStreamersService = createKnownStreamersService(deps, logger, sheetHelpers, streamChecker);
  const googleSheets = createGoogleSheets(deps, logger);
  
  // Store sheet references
  let sheet = null;
  let knownStreamersSheet = null;
  
  // Public interface
  return {
    // Configuration
    KNOWN_STREAMERS_ONLY,
    
    // Helper functions
    getCheckRateForPriority: getCheckRateForPriority,
    cleanUrl: cleanUrl,
    isValidLiveUrl: isValidLiveUrl,
    getPlatform: getPlatform,
    getField: (row, name, sheetObj) => sheetHelpers.getField(row, name, sheetObj || sheet),
    setField: (row, name, val, sheetObj) => sheetHelpers.setField(row, name, val, sheetObj || sheet),
    delay,
    log: logger.log,
    debug: logger.debug,
    
    // Core functions
    fetchUrlStatus: streamChecker.fetchUrlStatus,
    checkStatus: (row, i) => streamChecker.checkStatus(row, i, sheet),
    batchUpdateRows: (cycleStartTime) => batchUpdater.batchUpdateRows(sheet, streamChecker.pendingUpdates, cycleStartTime),
    isUrlInLivesheet: (url, rows) => knownStreamersService.isUrlInLivesheet(url, rows, sheet),
    checkKnownStreamers: () => knownStreamersService.checkKnownStreamers(sheet, knownStreamersSheet),
    initialize: async () => {
      const sheets = await googleSheets.initialize();
      sheet = sheets.sheet;
      knownStreamersSheet = sheets.knownStreamersSheet;
    },
    
    // State (for testing)
    pendingUpdates: streamChecker.pendingUpdates,
    knownStreamersLastCheck: knownStreamersService.knownStreamersLastCheck,
    
    // For testing access to sheets
    getSheet: () => sheet,
    getKnownStreamersSheet: () => knownStreamersSheet,
    setSheet: (s) => { sheet = s; },
    setKnownStreamersSheet: (s) => { knownStreamersSheet = s; },
    
    // Main loop will be defined in index.js
    main: null
  };
}