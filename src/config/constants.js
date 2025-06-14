/**
 * @fileoverview Configuration constants for the livestream checker application
 * @module config/constants
 */

// ============= CONFIGURATION =============
// Google Sheets
export const SHEET_ID = '1amkWpZu5hmI50XGINiz7-02XVNTTZoEARWEVRM-pvKo';
export const SHEET_NAME = 'Livesheet';
export const KNOWN_STREAMERS_SHEET_NAME = 'Known Streamers';

// Time constants (in milliseconds)
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

// Main checking rates
export const RATE_LIVE = 2 * MINUTE;                // Check live streams every 2 minutes
export const RATE_OFF = 7 * MINUTE;                 // Check offline streams every 7 minutes
export const RECENTLY_LIVE_THRESHOLD = 20 * MINUTE; // Consider "recently live" if within 20 minutes

// Known streamers configuration
export const BASE_CHECK_RATE = 15 * MINUTE;         // Minimum check interval for all priorities < 100
export const MIN_CHECK_RATE = 0;                    // Priority 100 = no rate limit
export const MAX_CHECK_RATE = 90 * MINUTE;          // Priority 0 = base + additional time
export const PRIORITY_ALWAYS_CHECK = 100;           // Priority 100 checked every cycle
export const MAX_KNOWN_STREAMERS_PER_CYCLE = 10;    // Max streamers to check per cycle

// Loop timing
export const LOOP_DELAY_MIN = 10 * 1000;           // 10 seconds
export const LOOP_DELAY_MAX = 20 * 1000;           // 20 seconds
export const ERROR_RETRY_DELAY = 30 * 1000;         // 30 seconds

// Priority grouping for logging
export const PRIORITY_GROUP_HIGH = 100;
export const PRIORITY_GROUP_MID = 10;
export const PRIORITY_GROUP_LOW = 1;

// Default headers for fetch
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
export const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

// URL patterns
export const NON_ASCII_PATTERN = /[^\x20-\x7E]/g;
export const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
export const URL_PATTERNS = {
  tiktok: /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/,
  youtubeWatch: /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
  youtubeLive: /^https:\/\/(www\.)?youtube\.com\/live\/.+/,
  youtubeShorts: /^https:\/\/(www\.)?youtube\.com\/shorts\/.+/,
  youtubeShort: /^https:\/\/youtu\.be\/.+/,
  twitch: /^https:\/\/(www\.)?twitch\.tv\/[^\/]+\/?$/
};