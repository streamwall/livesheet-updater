/**
 * @fileoverview Stream status checking functionality for TikTok, YouTube, and Twitch
 * @module services/streamChecker
 */

import { 
  DEFAULT_HEADERS, 
  RATE_LIVE, 
  RATE_OFF, 
  RECENTLY_LIVE_THRESHOLD,
  HTTP_STATUS_OK,
  STATUS_LIVE,
  STATUS_OFFLINE,
  WAF_CHALLENGE_PATTERNS,
  LIVE_INDICATORS,
  YOUTUBE_OFFLINE_INDICATOR,
  PLATFORM_YOUTUBE,
  PLATFORM_TIKTOK,
  PLATFORM_TWITCH,
  MS_PER_SECOND,
  COLUMN_NAMES
} from '../config/constants.js';
import { cleanUrl, isValidLiveUrl, getPlatform } from '../utils/url.js';

export const createStreamChecker = (deps, logger, sheetHelpers) => {
  const { fetch, Date } = deps;
  const { log, debug } = logger;
  const { getField } = sheetHelpers;
  
  // Map to store pending updates
  const pendingUpdates = new Map();
  
  /**
   * Fetch the live/offline status for a given streaming URL
   * @param {string} url - The streaming platform URL to check
   * @returns {Promise<{status: string, platform: string}|null>} Status object or null if error
   */
  async function fetchUrlStatus(url) {
    const cleaned = cleanUrl(url);
    const baseUrl = cleaned.split('?')[0];
    const platform = getPlatform(cleaned);
    
    try {
      const fetchUrl = platform === PLATFORM_YOUTUBE ? cleaned : baseUrl;
      debug(`Fetching status for ${platform}: "${fetchUrl}"`);
      
      const response = await fetch(fetchUrl, {
        headers: DEFAULT_HEADERS,
        redirect: 'follow'
      });
      
      if (response.status !== HTTP_STATUS_OK) {
        debug(`Non-200 status (${response.status}) for ${fetchUrl}`);
        return null;
      }
      
      const text = await response.text();
      
      // Check for WAF/challenge pages
      if (WAF_CHALLENGE_PATTERNS.some(pattern => text.includes(pattern))) {
        debug(`WAF/challenge page detected for ${fetchUrl}`);
        return null;
      }
      
      let status = STATUS_OFFLINE;
      
      if (platform === PLATFORM_TIKTOK) {
        if (LIVE_INDICATORS.TIKTOK.some(indicator => text.includes(indicator))) {
          status = STATUS_LIVE;
        }
      } else if (platform === PLATFORM_YOUTUBE) {
        // Check various YouTube live indicators
        const hasLiveIndicator = LIVE_INDICATORS.YOUTUBE.some(indicator => text.includes(indicator));
        const hasEndDate = text.includes(YOUTUBE_OFFLINE_INDICATOR);
        
        // Special handling for "isLiveBroadcast":"True" which needs to check for endDate
        if (hasLiveIndicator && (!text.includes('"isLiveBroadcast":"True"') || !hasEndDate)) {
          status = STATUS_LIVE;
        }
      } else if (platform === PLATFORM_TWITCH) {
        // Check various Twitch live indicators
        if (LIVE_INDICATORS.TWITCH.some(indicator => text.includes(indicator))) {
          status = STATUS_LIVE;
        }
      }
      
      debug(`${platform} status for ${baseUrl}: ${status}`);
      return { status, platform };
      
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        log(`Timeout fetching ${url}: ${e.message}`);
      } else if (e.name === 'TypeError' && e.message.includes('fetch')) {
        log(`Network error fetching ${url}: ${e.message}`);
      } else {
        debug(`Error fetching ${url}: ${e.message}`);
      }
      return null;
    }
  }

  /**
   * Check the status of a stream from a sheet row
   * @param {Object} row - Google Sheets row object
   * @param {number} i - Row index for logging
   * @param {Object} sheet - Google Sheets sheet object
   * @returns {Promise<void>}
   */
  async function checkStatus(row, i, sheet) {
    const url = getField(row, COLUMN_NAMES.LINK, sheet);
    if (!url) {
      debug(`[${i}] No URL found`);
      return;
    }
    
    // Clean the URL
    const originalUrl = url;
    const cleanedUrl = cleanUrl(url);
    
    if (originalUrl !== cleanedUrl) {
      debug(`[${i}] Cleaned URL: "${originalUrl}" -> "${cleanedUrl}"`);
    }
    
    // Validate URL
    if (!isValidLiveUrl(cleanedUrl)) {
      log(`[${i}] Skip invalid URL: ${cleanedUrl}`);
      return;
    }
    
    // Check rate limit
    const currentStatus = getField(row, COLUMN_NAMES.STATUS, sheet);
    const lastChecked = getField(row, COLUMN_NAMES.LAST_CHECKED, sheet);
    
    if (lastChecked) {
      const timeSinceLastCheck = Date.now() - new Date(lastChecked).getTime();
      const rateLimit = currentStatus === STATUS_LIVE ? RATE_LIVE : RATE_OFF;
      
      // Also check if recently live (should be checked more frequently)
      const lastLive = getField(row, COLUMN_NAMES.LAST_LIVE, sheet);
      const recentlyLive = lastLive && (Date.now() - new Date(lastLive).getTime() <= RECENTLY_LIVE_THRESHOLD);
      const effectiveRateLimit = recentlyLive ? RATE_LIVE : rateLimit;
      
      if (timeSinceLastCheck < effectiveRateLimit) {
        const timeAgo = Math.round(timeSinceLastCheck / MS_PER_SECOND);
        log(`[${i}] Skip (rate limit, ${timeAgo}s ago): ${cleanedUrl}`);
        return;
      }
    }
    
    log(`[${i}] Checking: ${cleanedUrl}`);
    const result = await fetchUrlStatus(cleanedUrl);
    
    if (!result) {
      log(`[${i}] Failed to fetch status for ${cleanedUrl}`);
      return;
    }
    
    // Store update for batch processing
    pendingUpdates.set(cleanedUrl, { row, status: result.status, index: i });
    log(`[${i}] Status: ${result.status}`);
  }
  
  return {
    fetchUrlStatus,
    checkStatus,
    pendingUpdates
  };
};