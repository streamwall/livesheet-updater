import fs from 'fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// 🗞 Config
const SHEET_ID = '1amkWpZu5hmI50XGINiz7-02XVNTTZoEARWEVRM-pvKo';
const SHEET_NAME = 'Livesheet';
const RATE_LIVE = 2 * 60 * 1000;
const RATE_OFF = 7 * 60 * 1000;

const LOOP_DELAY_MIN = 40000;
const LOOP_DELAY_MAX = 60000;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const delay = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => delay(min + Math.random() * (max - min));
const log = (...args) => console.log(new Date().toISOString(), ...args);

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

function getField(row, name) {
  const idx = sheet.headerValues.findIndex(h => h.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? row._rawData[idx] : undefined;
}
function setField(row, name, val) {
  const idx = sheet.headerValues.findIndex(h => h.toLowerCase() === name.toLowerCase());
  if (idx >= 0) row._rawData[idx] = val;
}

// Store updates to batch them
const pendingUpdates = new Map();

async function checkStatus(row, i) {
  const rawUrl = getField(row, 'Link');
  
  // Comprehensive debugging
  console.log(`\n[${i}] ===== URL PROCESSING DEBUG =====`);
  console.log(`[${i}] 1. Raw from sheet: ${JSON.stringify(rawUrl)}`);
  
  if (!rawUrl) {
    console.log(`[${i}] 2. Skipping - no URL`);
    return;
  }
  
  // Step 2: Initial trim
  let url = rawUrl.trim();
  console.log(`[${i}] 2. After trim: ${JSON.stringify(url)}`);
  console.log(`[${i}]    Length: ${url.length}`);
  console.log(`[${i}]    Char codes of last 5 chars: ${Array.from(url.slice(-5)).map(c => c.charCodeAt(0))}`);
  
  // Step 3: Clean non-ASCII
  const beforeClean = url;
  url = url.replace(/[^\x20-\x7E]/g, '');
  console.log(`[${i}] 3. After cleaning: ${JSON.stringify(url)}`);
  if (beforeClean !== url) {
    console.log(`[${i}]    Removed: ${Array.from(beforeClean).filter(c => c.charCodeAt(0) > 127).map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`)}`);
  }
  
  // Step 4: Check each validation pattern
  const patterns = {
    tiktok: /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/,
    youtubeWatch: /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
    youtubeLive: /^https:\/\/(www\.)?youtube\.com\/live\/.+/,
    youtubeShort: /^https:\/\/youtu\.be\/.+/
  };
  
  console.log(`[${i}] 4. Pattern matching:`);
  for (const [name, pattern] of Object.entries(patterns)) {
    const matches = pattern.test(url);
    console.log(`[${i}]    ${name}: ${matches}`);
    if (matches && name.includes('youtube')) {
      console.log(`[${i}]    Pattern: ${pattern}`);
      console.log(`[${i}]    URL: ${url}`);
    }
  }
  
  // Step 5: Show validation result
  const isValidLiveUrl = url && Object.values(patterns).some(p => p.test(url));
  console.log(`[${i}] 5. Valid URL: ${isValidLiveUrl}`);
  
  // Step 6: Additional YouTube debugging
  if (url.includes('youtube.com')) {
    console.log(`[${i}] 6. YouTube URL analysis:`);
    console.log(`[${i}]    Contains 'watch': ${url.includes('watch')}`);
    console.log(`[${i}]    Contains '?v=': ${url.includes('?v=')}`);
    console.log(`[${i}]    Index of '?v=': ${url.indexOf('?v=')}`);
    console.log(`[${i}]    URL structure: ${url.split('?')[0]} | ${url.split('?')[1] || 'NO PARAMS'}`);
  }
  
  if (!isValidLiveUrl) {
    console.log(`[${i}] 7. SKIPPING - Invalid URL`);
    console.log(`[${i}] ===== END DEBUG =====\n`);
    return;
  }
  
  console.log(`[${i}] 7. VALID - Proceeding with URL check`);
  console.log(`[${i}] ===== END DEBUG =====\n`);

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
  const platform = url.includes('tiktok.com') ? 'TikTok' : 'YouTube';
  log(`[${i}] Checking ${platform}: ${url}`);  // Show FULL URL, not baseUrl
  
  try {
    const response = await fetch(baseUrl, {
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
    let status = 'Offline';
    
    if (platform === 'TikTok') {
      // TikTok check
      if (html.includes('"isLiveBroadcast":true')) {
        status = 'Live';
      }
    } else {
      // YouTube check - look for specific live indicators
      if (html.includes('"isLiveBroadcast":"True"') && !html.includes('"endDate":"')) {
        log(`[${i}] DEBUG: Found isLiveBroadcast:True without endDate`);
        status = 'Live';
      } else if (html.includes('"liveBroadcastDetails"') && html.includes('"isLiveNow":true')) {
        log(`[${i}] DEBUG: Found liveBroadcastDetails with isLiveNow`);
        status = 'Live';
      } else if (html.includes('\\\"isLive\\\":true') || html.includes('"isLive":true')) {
        log(`[${i}] DEBUG: Found isLive:true`);
        status = 'Live';
      } else if (html.includes('"videoDetails":') && html.includes('"isLiveContent":true') && html.includes('"isLive":true')) {
        log(`[${i}] DEBUG: Found videoDetails with isLiveContent and isLive`);
        status = 'Live';
      }
      
      // Debug: Check what we're actually finding
      if (status === 'Offline' && platform === 'YouTube') {
        // Check for common offline indicators
        if (html.includes('Streamed live') || html.includes('was live')) {
          log(`[${i}] DEBUG: Found past stream indicator`);
        } else if (html.includes('"watching"')) {
          log(`[${i}] DEBUG: Found 'watching' but not in live context`);
        }
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
  
  try {
    // Get fresh data to avoid race conditions
    log('Fetching fresh sheet data before update...');
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
      
      // Apply our updates to the fresh row
      setField(freshRow, 'Status', status);
      setField(freshRow, 'Last Checked (PST)', nowIso);
      if (status === 'Live') {
        setField(freshRow, 'Last Live (PST)', nowIso);
      }
      const addedDate = getField(freshRow, 'Added Date');
      if (!addedDate) {
        setField(freshRow, 'Added Date', nowIso);
      }
      
      updatedCount++;
    }
    
    // Save all updates at once
    if (updatedCount > 0) {
      // await sheet.saveUpdatedCells();
      log(`Batch update complete: ${updatedCount} rows would be updated, ${skippedCount} skipped (SHEET UPDATE DISABLED)`);
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
  log(`TikTok Live Checker started`);

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
        log('Sample prioritized row:', sheet.headerValues.map((h, idx) => `${h}=${prioritized[0].row._rawData[idx]}`).join('; '));
        
        // Debug: Show all YouTube URLs to see if they're truncated in the sheet
        const youtubeRows = prioritized.filter(({row}) => {
          const url = getField(row, 'Link')?.trim();
          return url && url.includes('youtube.com');
        }).slice(0, 5); // Show first 5 YouTube URLs
        
        if (youtubeRows.length > 0) {
          log('DEBUG: First few YouTube URLs from sheet:');
          youtubeRows.forEach(({row, i}) => {
            const url = getField(row, 'Link');
            log(`  [${i}] Raw URL:`, JSON.stringify(url));
          });
        }
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