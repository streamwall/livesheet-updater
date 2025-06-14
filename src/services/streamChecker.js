/**
 * @fileoverview Stream status checking functionality for TikTok, YouTube, and Twitch
 * @module services/streamChecker
 */

import { DEFAULT_HEADERS, RATE_LIVE, RATE_OFF, RECENTLY_LIVE_THRESHOLD } from '../config/constants.js';
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
      const fetchUrl = platform === 'YouTube' ? cleaned : baseUrl;
      debug(`Fetching status for ${platform}: "${fetchUrl}"`);
      
      const response = await fetch(fetchUrl, {
        headers: DEFAULT_HEADERS,
        redirect: 'follow'
      });
      
      if (response.status !== 200) {
        debug(`Non-200 status (${response.status}) for ${fetchUrl}`);
        return null;
      }
      
      const text = await response.text();
      
      // Check for WAF/challenge pages
      if (text.includes('_cf_chl_opt') || text.includes('_jschl_answer') || text.includes('_wafchallengeid')) {
        debug(`WAF/challenge page detected for ${fetchUrl}`);
        return null;
      }
      
      let status = 'Offline';
      
      if (platform === 'TikTok') {
        if (text.includes('"isLiveBroadcast":true')) {
          status = 'Live';
        }
      } else if (platform === 'YouTube') {
        // Check various YouTube live indicators
        if (
          (text.includes('"isLiveBroadcast":"True"') && !text.includes('endDate')) ||
          text.includes('"isLiveBroadcast" content="True"') ||
          text.includes('"liveBroadcastDetails":{"isLiveNow":true}') ||
          text.includes('"isLive":true') ||
          text.includes('\\\"isLive\\\":true') ||
          text.includes('"videoDetails":{"isLiveContent":true,"isLive":true}')
        ) {
          status = 'Live';
        }
      } else if (platform === 'Twitch') {
        // Check various Twitch live indicators
        if (
          text.includes('"isLiveBroadcast":true') ||
          text.includes('tw-channel-status-text-indicator') ||
          text.includes('"stream":{') ||
          text.includes('viewers</p>') ||
          text.includes('data-a-target="tw-indicator"')
        ) {
          status = 'Live';
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
    const url = getField(row, 'Link', sheet);
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
    const currentStatus = getField(row, 'Status', sheet);
    const lastChecked = getField(row, 'Last Checked (PST)', sheet);
    
    if (lastChecked) {
      const timeSinceLastCheck = Date.now() - new Date(lastChecked).getTime();
      const rateLimit = currentStatus === 'Live' ? RATE_LIVE : RATE_OFF;
      
      // Also check if recently live (should be checked more frequently)
      const lastLive = getField(row, 'Last Live (PST)', sheet);
      const recentlyLive = lastLive && (Date.now() - new Date(lastLive).getTime() <= RECENTLY_LIVE_THRESHOLD);
      const effectiveRateLimit = recentlyLive ? RATE_LIVE : rateLimit;
      
      if (timeSinceLastCheck < effectiveRateLimit) {
        const timeAgo = Math.round(timeSinceLastCheck / 1000);
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