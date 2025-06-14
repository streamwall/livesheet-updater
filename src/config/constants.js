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

// Priority calculation
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 100;
export const PRIORITY_STEEPNESS_FACTOR = 4;

// HTTP Status Codes
export const HTTP_STATUS_OK = 200;

// Stream Status Values
export const STATUS_LIVE = 'Live';
export const STATUS_OFFLINE = 'Offline';

// Time Conversion
export const MS_PER_SECOND = 1000;

// Platform Names
export const PLATFORM_TIKTOK = 'TikTok';
export const PLATFORM_YOUTUBE = 'YouTube';
export const PLATFORM_TWITCH = 'Twitch';
export const PLATFORM_UNKNOWN = 'Unknown';

// Platform Domains
export const DOMAIN_TIKTOK = 'tiktok.com';
export const DOMAIN_YOUTUBE = 'youtube.com';
export const DOMAIN_YOUTUBE_SHORT = 'youtu.be';
export const DOMAIN_TWITCH = 'twitch.tv';

// WAF/Challenge Detection
export const WAF_CHALLENGE_PATTERNS = ['_cf_chl_opt', '_jschl_answer', '_wafchallengeid'];

// Platform Live Detection Patterns
export const LIVE_INDICATORS = {
  TIKTOK: ['"isLiveBroadcast":true'],
  YOUTUBE: [
    '"isLiveBroadcast":"True"',
    '"isLiveBroadcast" content="True"',
    '"liveBroadcastDetails"',
    '"isLiveNow":true',
    '\\\"isLive\\\":true',
    '"isLive":true',
    '"isLiveContent":true'
  ],
  TWITCH: [
    '"isLiveBroadcast":true',
    'tw-channel-status-text-indicator',
    '"stream":{',
    'viewers</p>',
    'data-a-target="tw-indicator"'
  ]
};

// YouTube specific patterns
export const YOUTUBE_OFFLINE_INDICATOR = '"endDate"';

// Google Sheets API
export const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const DEFAULT_ROW_LIMIT = 1;

// Google Sheets Column Names
export const COLUMN_NAMES = {
  SOURCE: 'Source',
  PLATFORM: 'Platform',
  LINK: 'Link',
  STATUS: 'Status',
  LAST_CHECKED: 'Last Checked (PST)',
  LAST_LIVE: 'Last Live (PST)',
  ADDED_DATE: 'Added Date',
  URL: 'URL',
  CITY: 'City',
  STATE: 'State',
  PRIORITY: 'Priority'
};

// Error Messages
export const ERROR_MESSAGES = {
  MISSING_CREDS: 'Missing creds.json file. Please create one from creds.example.json',
  INVALID_CREDS: 'Invalid creds.json file. Please ensure it contains valid JSON',
  CREDS_LOAD_FAILED: (error) => `Failed to load credentials: ${error}`,
  SHEET_NOT_FOUND: (name) => `Sheet "${name}" not found`,
  KNOWN_STREAMERS_WARNING: (name) => `Warning: Sheet "${name}" not found. Known streamers feature disabled.`,
  KNOWN_STREAMERS_MODE_ERROR: 'ERROR: Known Streamers Only mode requested but Known Streamers sheet not found!'
};

// File Paths
export const CREDS_FILE_PATH = './creds.json';

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