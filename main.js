import fs from 'fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// 🗞 Config
const SHEET_ID = '1amkWpZu5hmI50XGINiz7-02XVNTTZoEARWEVRM-pvKo';
const SHEET_NAME = 'Livesheet';
const RATE_LIVE = 2 * 60 * 1000;
const RATE_OFF = 7 * 60 * 1000;

const LOOP_DELAY_MIN = 10000;
const LOOP_DELAY_MAX = 20000;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const delay = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => delay(min + Math.random() * (max - min));
const log = (...args) => console.log(new Date().toISOString(), ...args);
const debug = (...args) => {
  if (process.env.DEBUG) console.log(new Date().toISOString(), '[DEBUG]', ...args);
};

// 📜 Google Sheets setup
const CREDS = JSON.parse(await fs.readFile('./creds.json', 'utf8'));
const auth = new GoogleAuth({
  credentials: CREDS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const client = await auth.getClient();
const doc = new GoogleSpreadsheet(SHEET_ID, client);
await doc.loadInfo();

const sheet = doc.sheetsByTitle[SHEET_NAME];
if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);
await sheet.getRows({ limit: 1 });
log(`Loaded sheet "${sheet.title}", headers:`, JSON.stringify(sheet.headerValues));

// Helper functions to work with case-insensitive column names
function getField(row, name) {
  // Try exact match first
  if (row.get(name) !== undefined) {
    return row.get(name);
  }
  
  // Try case-insensitive match
  const actualColumnName = sheet.headerValues.find(h => h.toLowerCase() === name.toLowerCase());
  if (actualColumnName) {
    return row.get(actualColumnName);
  }
  
  // Debug if not found
  if (name.includes('Date')) {
    debug(`getField: Column '${name}' not found. Available columns: ${sheet.headerValues.join(', ')}`);
  }
  return undefined;
}

function setField(row, name, val) {
  // Try exact match first
  try {
    row.set(name, val);
    return;
  } catch (e) {
    // Continue to case-insensitive match
  }
  
  // Try case-insensitive match
  const actualColumnName = sheet.headerValues.find(h => h.toLowerCase() === name.toLowerCase());
  if (actualColumnName) {
    row.set(actualColumnName, val);
  } else {
    debug(`setField: Failed to set '${name}' = '${val}'. Column not found. Available: ${sheet.headerValues.join(', ')}`);
  }
}

// Store updates to batch them
const pendingUpdates = new Map();

async function checkStatus(row, i) {
  const rawUrl = getField(row, 'Link');
  
  // URL processing
  if (!rawUrl) {
    return;
  }
  
  // Clean and validate URL
  let url = rawUrl.trim();
  const beforeClean = url;
  
  // Remove all non-printable and non-ASCII characters
  url = url.replace(/[^\x20-\x7E]/g, '');
  // Also specifically remove zero-width characters
  url = url.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
  
  if (beforeClean !== url) {
    debug(`[${i}] Cleaned URL from: ${JSON.stringify(beforeClean)} to: ${JSON.stringify(url)}`);
  }
  
  // Validate URL patterns
  const patterns = {
    tiktok: /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/,
    youtubeWatch: /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
    youtubeLive: /^https:\/\/(www\.)?youtube\.com\/live\/.+/,
    youtubeShort: /^https:\/\/youtu\.be\/.+/,
    twitch: /^https:\/\/(www\.)?twitch\.tv\/.+/
  };
  
  const isValidLiveUrl = url && Object.values(patterns).some(p => p.test(url));
  
  if (!isValidLiveUrl) {
    log(`[${i}] Skip invalid URL:`, url);
    return;
  }

  const now = Date.now();
  const lastRaw = getField(row, 'Last Checked (PST)');
  const lastTs = lastRaw ? new Date(lastRaw).getTime() : 0;
  const prev = getField(row, 'Status')?.toLowerCase() || 'offline';
  const threshold = prev === 'live' ? RATE_LIVE : RATE_OFF;

  if (now - lastTs < threshold) {
    log(`[${i}] Skip (rate limit, ${Math.round((now - lastTs) / 1000)}s ago):`, url);
    return;
  }

  const baseUrl = url.split('?')[0];
  const platform = url.includes('tiktok.com') ? 'TikTok' : 
                   url.includes('youtube.com') || url.includes('youtu.be') ? 'YouTube' :
                   url.includes('twitch.tv') ? 'Twitch' : 'Unknown';
  log(`[${i}] Checking ${platform}: ${url}`);  // Show FULL URL, not baseUrl
  
  try {
    // For YouTube, always use the full URL with parameters
    const fetchUrl = platform === 'YouTube' ? url : baseUrl;
    debug(`[${i}] Fetching: "${fetchUrl}"`);
    
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow'
    });

    if (response.status !== 200) {
      log(`[${i}] HTTP ${response.status} for ${url}`);
      return;
    }

    const html = await response.text();
    
    // Check for WAF/challenge pages
    if (html.includes('_wafchallengeid') || html.includes('Please wait...') || html.includes('/waf-aiso/')) {
      log(`[${i}] WARNING: Received challenge/WAF page, skipping`);
      return; // Don't update status when we get a challenge page
    }
    
    let status = 'Offline';
    
    if (platform === 'TikTok') {
      // TikTok check
      if (html.includes('"isLiveBroadcast":true')) {
        debug(`[${i}] Found TikTok isLiveBroadcast:true`);
        status = 'Live';
      } else {
        // Debug: Check what we're getting for TikTok
        if (html.includes('isLiveBroadcast')) {
          const context = html.indexOf('isLiveBroadcast');
          debug(`[${i}] Found 'isLiveBroadcast' at position ${context}`);
          debug(`[${i}] Context: ...${html.substring(Math.max(0, context - 50), context + 100)}...`);
        }
        
        // Check for other TikTok live indicators
        if (html.includes('LiveRoomInfo') || html.includes('"status":2') || html.includes('viewer_count')) {
          debug(`[${i}] Found other TikTok live indicators`);
        }
      }
    } else if (platform === 'Twitch') {
      // Twitch check - for Twitch, isLiveBroadcast:true means it's currently live
      // The endDate appears to be a projected end time, not an indication the stream has ended
      if (html.includes('"isLiveBroadcast":true')) {
        debug(`[${i}] Found Twitch isLiveBroadcast:true`);
        status = 'Live';
      } else {
        // Additional check: look for viewer count or live badge
        if (html.includes('tw-channel-status-text-indicator') || 
            html.includes('"stream":{') ||
            html.includes('viewers</p>') ||
            html.includes('data-a-target="tw-indicator"')) {
          debug(`[${i}] Found other Twitch live indicators`);
          status = 'Live';
        }
      }
    } else if (platform === 'YouTube') {
      // YouTube check - look for specific live indicators
      debug(`[${i}] YouTube response length: ${html.length} characters`);
      
      if (html.includes('"isLiveBroadcast":"True"') && !html.includes('"endDate":"')) {
        debug(`[${i}] Detected LIVE - isLiveBroadcast:True without endDate`);
        status = 'Live';
      } else if (html.includes('"isLiveBroadcast" content="True"') && !html.includes('"endDate"')) {
        debug(`[${i}] Detected LIVE - isLiveBroadcast content="True" without endDate`);
        status = 'Live';
      } else if (html.includes('"liveBroadcastDetails"') && html.includes('"isLiveNow":true')) {
        debug(`[${i}] Detected LIVE - liveBroadcastDetails with isLiveNow`);
        status = 'Live';
      } else if (html.includes('\\\"isLive\\\":true') || html.includes('"isLive":true')) {
        debug(`[${i}] Detected LIVE - isLive:true`);
        status = 'Live';
      } else if (html.includes('"videoDetails":') && html.includes('"isLiveContent":true') && html.includes('"isLive":true')) {
        debug(`[${i}] Detected LIVE - videoDetails with isLiveContent and isLive`);
        status = 'Live';
      }
      
      // Debug helpers if needed
      if (process.env.DEBUG) {
        const checks = {
          'isLiveBroadcast:"True"': html.includes('"isLiveBroadcast":"True"'),
          'isLiveBroadcast content="True"': html.includes('"isLiveBroadcast" content="True"'),
          'endDate present': html.includes('"endDate"') || html.includes('endDate"')
        };
        debug(`[${i}] YouTube indicators:`, Object.entries(checks).filter(([k,v]) => v).map(([k]) => k).join(', '));
      }
    }
    
    log(`[${i}] Status: ${status} for ${platform} ${url}`);
    
    // Store update for batching
    pendingUpdates.set(url, { row, status, index: i });
    
  } catch (e) {
    log(`[${i}] Request error:`, e.message);
  }
}

async function batchUpdateRows(cycleStartTime) {
  if (pendingUpdates.size === 0) return;
  
  log(`Preparing batch update for ${pendingUpdates.size} rows...`);
  const nowIso = new Date().toISOString();
  
  debug('Sheet column headers:', JSON.stringify(sheet.headerValues));
  
  try {
    // Get fresh data to avoid race conditions
    debug('Fetching fresh sheet data before update...');
    const freshRows = await sheet.getRows();
    
    // Create a map for quick lookup
    const freshRowMap = new Map();
    for (const row of freshRows) {
      const url = getField(row, 'Link')?.trim();
      if (url) freshRowMap.set(url, row);
    }
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // Process each pending update
    for (const [url, { status }] of pendingUpdates) {
      const freshRow = freshRowMap.get(url);
      
      if (!freshRow) {
        log(`Row deleted by user, skipping: ${url}`);
        skippedCount++;
        continue;
      }
      
      // Check if someone else updated it more recently
      const freshLastChecked = getField(freshRow, 'Last Checked (PST)');
      if (freshLastChecked && new Date(freshLastChecked).getTime() > cycleStartTime) {
        log(`Row updated by another process, skipping: ${url}`);
        skippedCount++;
        continue;
      }
      
      // Build update object
      const updates = {
        'Status': status,
        'Last Checked (PST)': nowIso
      };
      
      if (status === 'Live') {
        updates['Last Live (PST)'] = nowIso;
      }
      
      const addedDate = getField(freshRow, 'Added Date');
      if (!addedDate) {
        updates['Added Date'] = nowIso;
      }
      
      // Apply all updates at once
      freshRow.assign(updates);
      
      // Save this row
      try {
        await freshRow.save();
        updatedCount++;
        debug(`Updated row for ${url} - Status: ${status}`);
      } catch (saveError) {
        log(`ERROR saving row for ${url}: ${saveError.message}`);
        skippedCount++;
      }
    }
    
    // Log summary
    if (updatedCount > 0 || skippedCount > 0) {
      log(`Batch update complete: ${updatedCount} rows updated, ${skippedCount} skipped`);
    } else {
      log(`No rows to update (all were deleted or modified)`);
    }
    
    pendingUpdates.clear();
    
  } catch (e) {
    log(`Batch update error:`, e.message);
    pendingUpdates.clear();
  }
}

async function main() {
  log(`Live Checker started`);

  while (true) {
    try {
      // Record cycle start time for race condition detection
      const cycleStartTime = Date.now();
      
      // Single read per cycle
      const rows = await sheet.getRows();
      log('Cycle start —', rows.length, 'rows fetched');

      const now = Date.now();
      const prioritized = rows.map((row, i) => ({ row, i })).sort((a, b) => {
        const getPriority = r => {
          if (!getField(r, 'Last Checked (PST)')) return 3;
          if (getField(r, 'Status')?.toLowerCase() === 'live') return 2;
          const lastLive = getField(r, 'Last Live (PST)');
          if (lastLive && now - new Date(lastLive).getTime() <= 20 * 60 * 1000) return 1;
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

      const sleepTime = LOOP_DELAY_MIN + Math.random() * (LOOP_DELAY_MAX - LOOP_DELAY_MIN);
      log(`Cycle complete — sleeping ${(sleepTime / 1000).toFixed(0)}s`);
      await delay(sleepTime);
      
    } catch (e) {
      log('Main loop error:', e.message);
      await delay(30000); // Wait 30s on error
    }
  }
}

main();