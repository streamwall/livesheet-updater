import fs from 'fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// 🗞 Config
const SHEET_ID = '1amkWpZu5hmI50XGINiz7-02XVNTTZoEARWEVRM-pvKo';
const SHEET_NAME = 'Livesheet';
const KNOWN_STREAMERS_SHEET_NAME = 'Known Streamers';
const RATE_LIVE = 2 * 60 * 1000;
const RATE_OFF = 7 * 60 * 1000;

// Known streamer check rates based on priority
const KNOWN_STREAMER_RATES = {
  'high': 5 * 60 * 1000,      // 5 minutes
  'medium': 15 * 60 * 1000,   // 15 minutes
  'low': 30 * 60 * 1000       // 30 minutes
};

const LOOP_DELAY_MIN = 10000;
const LOOP_DELAY_MAX = 20000;
const RECENTLY_LIVE_THRESHOLD = 20 * 60 * 1000; // 20 minutes

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

const delay = ms => new Promise(r => setTimeout(r, ms));
const log = (...args) => console.log(new Date().toISOString(), ...args);
const debug = (...args) => {
  if (process.env.DEBUG) console.log(new Date().toISOString(), '[DEBUG]', ...args);
};

// Helper to clean URLs consistently
const cleanUrl = (url) => {
  return url.trim()
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
};

// URL validation patterns
const URL_PATTERNS = {
  tiktok: /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/,
  youtubeWatch: /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
  youtubeLive: /^https:\/\/(www\.)?youtube\.com\/live\/.+/,
  youtubeShort: /^https:\/\/youtu\.be\/.+/,
  twitch: /^https:\/\/(www\.)?twitch\.tv\/.+/
};

const isValidLiveUrl = (url) => {
  return url && Object.values(URL_PATTERNS).some(p => p.test(url));
};

const getPlatform = (url) => {
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('twitch.tv')) return 'Twitch';
  return 'Unknown';
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

const knownStreamersSheet = doc.sheetsByTitle[KNOWN_STREAMERS_SHEET_NAME];
if (!knownStreamersSheet) {
  log(`Warning: Sheet "${KNOWN_STREAMERS_SHEET_NAME}" not found. Known streamers feature disabled.`);
} else {
  await knownStreamersSheet.getRows({ limit: 1 });
  log(`Loaded sheet "${knownStreamersSheet.title}", headers:`, JSON.stringify(knownStreamersSheet.headerValues));
}

// Helper functions to work with case-insensitive column names
function getField(row, name, sheetObj = sheet) {
  // Try exact match first
  if (row.get(name) !== undefined) {
    return row.get(name);
  }
  
  // Try case-insensitive match
  const actualColumnName = sheetObj.headerValues.find(h => h.toLowerCase() === name.toLowerCase());
  if (actualColumnName) {
    return row.get(actualColumnName);
  }
  
  // Debug if not found
  if (name.includes('Date')) {
    debug(`getField: Column '${name}' not found. Available columns: ${sheetObj.headerValues.join(', ')}`);
  }
  return undefined;
}

function setField(row, name, val, sheetObj = sheet) {
  // Try exact match first
  try {
    row.set(name, val);
    return;
  } catch (e) {
    // Continue to case-insensitive match
  }
  
  // Try case-insensitive match
  const actualColumnName = sheetObj.headerValues.find(h => h.toLowerCase() === name.toLowerCase());
  if (actualColumnName) {
    row.set(actualColumnName, val);
  } else {
    debug(`setField: Failed to set '${name}' = '${val}'. Column not found. Available: ${sheetObj.headerValues.join(', ')}`);
  }
}

// Store updates to batch them
const pendingUpdates = new Map();

// Store last check times for known streamers
const knownStreamersLastCheck = new Map();

// Extract the core URL status checking logic
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
      debug(`HTTP ${response.status} for ${cleaned}`);
      return null;
    }

    const html = await response.text();
    
    // Check for WAF/challenge pages
    if (html.includes('_wafchallengeid') || html.includes('Please wait...') || html.includes('/waf-aiso/')) {
      debug(`Received challenge/WAF page for ${cleaned}`);
      return null;
    }
    
    let status = 'Offline';
    
    if (platform === 'TikTok') {
      if (html.includes('"isLiveBroadcast":true')) {
        status = 'Live';
      }
    } else if (platform === 'Twitch') {
      if (html.includes('"isLiveBroadcast":true') || 
          html.includes('tw-channel-status-text-indicator') || 
          html.includes('"stream":{') ||
          html.includes('viewers</p>') ||
          html.includes('data-a-target="tw-indicator"')) {
        status = 'Live';
      }
    } else if (platform === 'YouTube') {
      if ((html.includes('"isLiveBroadcast":"True"') && !html.includes('"endDate":"')) ||
          (html.includes('"isLiveBroadcast" content="True"') && !html.includes('"endDate"')) ||
          (html.includes('"liveBroadcastDetails"') && html.includes('"isLiveNow":true')) ||
          html.includes('\\\"isLive\\\":true') || 
          html.includes('"isLive":true') ||
          (html.includes('"videoDetails":') && html.includes('"isLiveContent":true') && html.includes('"isLive":true'))) {
        status = 'Live';
      }
    }
    
    return { status, platform };
  } catch (e) {
    debug(`Error fetching status for ${cleaned}:`, e.message);
    return null;
  }
}

async function checkStatus(row, i) {
  const rawUrl = getField(row, 'Link');
  
  // URL processing
  if (!rawUrl) {
    return;
  }
  
  // Clean and validate URL
  const beforeClean = rawUrl;
  const url = cleanUrl(rawUrl);
  
  if (beforeClean.trim() !== url) {
    debug(`[${i}] Cleaned URL from: ${JSON.stringify(beforeClean)} to: ${JSON.stringify(url)}`);
  }
  
  // Validate URL
  if (!isValidLiveUrl(url)) {
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

  log(`[${i}] Checking: ${url}`);
  
  const result = await fetchUrlStatus(url);
  
  if (!result) {
    log(`[${i}] Failed to fetch status for ${url}`);
    return;
  }
  
  const { status, platform } = result;
  log(`[${i}] Status: ${status} for ${platform} ${url}`);
  
  // Store update for batching
  pendingUpdates.set(url, { row, status, index: i });
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

// Check if a URL is already present in the Livesheet
async function isUrlInLivesheet(url, livesheetRows) {
  const cleaned = cleanUrl(url);
  
  for (const row of livesheetRows) {
    const rowUrl = getField(row, 'Link');
    if (!rowUrl) continue;
    
    const cleanRowUrl = cleanUrl(rowUrl);
    if (cleanRowUrl === cleaned) {
      return true;
    }
  }
  
  return false;
}

// Check known streamers and add live ones to Livesheet
async function checkKnownStreamers() {
  if (!knownStreamersSheet) {
    return;
  }
  
  try {
    const knownStreamers = await knownStreamersSheet.getRows();
    const livesheetRows = await sheet.getRows();
    const now = Date.now();
    const nowIso = new Date().toISOString();
    let addedCount = 0;
    
    log(`Checking ${knownStreamers.length} known streamers...`);
    
    for (const knownStreamer of knownStreamers) {
      const rawUrl = getField(knownStreamer, 'URL', knownStreamersSheet);
      const city = getField(knownStreamer, 'City', knownStreamersSheet);
      const state = getField(knownStreamer, 'State', knownStreamersSheet);
      const priority = (getField(knownStreamer, 'Priority', knownStreamersSheet) || 'low').toLowerCase();
      
      if (!rawUrl) continue;
      
      // Clean URL like in checkStatus
      const url = cleanUrl(rawUrl);
      
      // Validate URL
      if (!isValidLiveUrl(url)) {
        debug(`Skip invalid known streamer URL:`, url);
        continue;
      }
      
      // Check rate limit for this streamer
      const lastCheck = knownStreamersLastCheck.get(url) || 0;
      const rate = KNOWN_STREAMER_RATES[priority] || KNOWN_STREAMER_RATES['low'];
      
      if (now - lastCheck < rate) {
        continue;
      }
      
      knownStreamersLastCheck.set(url, now);
      
      // Check if already in Livesheet
      if (await isUrlInLivesheet(url, livesheetRows)) {
        debug(`Known streamer already in Livesheet: ${url}`);
        continue;
      }
      
      // Check if streamer is live
      const result = await fetchUrlStatus(url);
      
      if (result && result.status === 'Live') {
        log(`Found live known streamer not in Livesheet: ${url}`);
        
        // Add to Livesheet
        const newRow = await sheet.addRow({
          'Link': url,
          'Platform': result.platform,
          'City': city || '',
          'State': state || '',
          'Status': 'Live',
          'Last Checked (PST)': nowIso,
          'Last Live (PST)': nowIso,
          'Added Date': nowIso,
          'Source': 'Known Streamers Auto-Add'
        });
        
        addedCount++;
        log(`Added known streamer to Livesheet: ${url} (${city}, ${state})`);
      }
    }
    
    if (addedCount > 0) {
      log(`Added ${addedCount} known streamers to Livesheet`);
    }
    
  } catch (e) {
    log('Known streamers check error:', e.message);
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

      // Check known streamers periodically
      await checkKnownStreamers();

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