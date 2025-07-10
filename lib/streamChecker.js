import { log, debug, FETCH_HEADERS } from './utils.js';

// URL validation patterns
const URL_PATTERNS = {
  tiktok: /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/,
  youtubeWatch: /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
  youtubeLive: /^https:\/\/(www\.)?youtube\.com\/live\/.+/,
  youtubeShort: /^https:\/\/youtu\.be\/.+/,
  twitch: /^https:\/\/(www\.)?twitch\.tv\/.+/
};

/**
 * Clean and validate a URL
 * @param {string} url - Raw URL to clean
 * @returns {string|null} Cleaned URL or null if invalid
 */
export function cleanUrl(url) {
  if (!url) return null;
  
  let cleanUrl = url.trim();
  // Remove all non-printable and non-ASCII characters
  cleanUrl = cleanUrl.replace(/[^\x20-\x7E]/g, '');
  // Remove zero-width characters
  cleanUrl = cleanUrl.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
  
  return cleanUrl;
}

/**
 * Check if URL is valid for live streaming
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid live stream URL
 */
export function isValidLiveUrl(url) {
  return url && Object.values(URL_PATTERNS).some(p => p.test(url));
}

/**
 * Check if stream should be checked based on rate limiting
 * @param {Object} stream - Stream object
 * @param {number} rateLive - Rate limit for live streams (ms)
 * @param {number} rateOff - Rate limit for offline streams (ms)
 * @returns {boolean} True if stream should be checked
 */
export function shouldCheckStream(stream, rateLive, rateOff) {
  const now = Date.now();
  const lastChecked = stream.last_checked_at ? new Date(stream.last_checked_at).getTime() : 0;
  const currentStatus = stream.status?.toLowerCase() || 'offline';
  const threshold = currentStatus === 'live' ? rateLive : rateOff;
  
  if (now - lastChecked < threshold) {
    debug(`Stream ${stream.id} checked recently (${Math.round((now - lastChecked) / 1000)}s ago), skipping`);
    return false;
  }
  
  return true;
}

/**
 * Detect live status from HTML content
 * @param {string} html - HTML content
 * @param {string} platform - Platform name
 * @returns {string} 'live' or 'offline'
 */
export function detectLiveStatus(html, platform) {
  let status = 'offline';
  
  if (platform === 'TikTok') {
    if (html.includes('"isLiveBroadcast":true')) {
      debug(`Found TikTok isLiveBroadcast:true`);
      status = 'live';
    }
  } else if (platform === 'Twitch') {
    if (html.includes('"isLiveBroadcast":true')) {
      debug(`Found Twitch isLiveBroadcast:true`);
      status = 'live';
    } else if (html.includes('tw-channel-status-text-indicator') || 
               html.includes('"stream":{') ||
               html.includes('viewers</p>') ||
               html.includes('data-a-target="tw-indicator"')) {
      debug(`Found other Twitch live indicators`);
      status = 'live';
    }
  } else if (platform === 'YouTube') {
    if (html.includes('"isLiveBroadcast":"True"') && !html.includes('"endDate":"')) {
      debug(`Detected LIVE - isLiveBroadcast:True without endDate`);
      status = 'live';
    } else if (html.includes('"isLiveBroadcast" content="True"') && !html.includes('"endDate"')) {
      debug(`Detected LIVE - isLiveBroadcast content="True" without endDate`);
      status = 'live';
    } else if (html.includes('"liveBroadcastDetails"') && html.includes('"isLiveNow":true')) {
      debug(`Detected LIVE - liveBroadcastDetails with isLiveNow`);
      status = 'live';
    } else if (html.includes('\\\"isLive\\\":true') || html.includes('"isLive":true')) {
      debug(`Detected LIVE - isLive:true`);
      status = 'live';
    } else if (html.includes('"videoDetails":') && html.includes('"isLiveContent":true') && html.includes('"isLive":true')) {
      debug(`Detected LIVE - videoDetails with isLiveContent and isLive`);
      status = 'live';
    }
  }
  
  return status;
}

/**
 * Check stream status by fetching the URL
 * @param {Object} stream - Stream object
 * @param {number} rateLive - Rate limit for live streams (ms)
 * @param {number} rateOff - Rate limit for offline streams (ms)
 * @returns {Promise<Object|null>} Status result or null
 */
export async function checkStreamStatus(stream, rateLive, rateOff) {
  const url = stream.link;
  if (!url) {
    log(`Stream ${stream.id} has no URL, skipping`);
    return null;
  }

  const cleanedUrl = cleanUrl(url);
  if (!cleanedUrl || !isValidLiveUrl(cleanedUrl)) {
    log(`Stream ${stream.id} has invalid URL: ${cleanedUrl}`);
    return null;
  }

  if (!shouldCheckStream(stream, rateLive, rateOff)) {
    return null;
  }

  const baseUrl = cleanedUrl.split('?')[0];
  const platform = stream.platform || 'Unknown';
  
  log(`[${stream.id}] Checking ${platform}: ${cleanedUrl}`);
  
  try {
    // For YouTube, always use the full URL with parameters
    const fetchUrl = platform === 'YouTube' ? cleanedUrl : baseUrl;
    debug(`[${stream.id}] Fetching: "${fetchUrl}"`);
    
    const response = await fetch(fetchUrl, {
      headers: FETCH_HEADERS,
      redirect: 'follow'
    });

    if (response.status !== 200) {
      log(`[${stream.id}] HTTP ${response.status} for ${cleanedUrl}`);
      return null;
    }

    const html = await response.text();
    
    // Check for WAF/challenge pages
    if (html.includes('_wafchallengeid') || html.includes('Please wait...') || html.includes('/waf-aiso/')) {
      log(`[${stream.id}] WARNING: Received challenge/WAF page, skipping`);
      return null;
    }
    
    const status = detectLiveStatus(html, platform);
    
    log(`[${stream.id}] Status: ${status.toUpperCase()} for ${platform} ${cleanedUrl}`);
    
    return { streamId: stream.id, status, platform };
    
  } catch (e) {
    log(`[${stream.id}] Request error:`, e.message);
    return null;
  }
}