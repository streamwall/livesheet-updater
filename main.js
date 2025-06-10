import { GoogleSpreadsheet } from 'google-spreadsheet';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs/promises';

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

async function checkStatus(row, i) {
  const url = getField(row, 'Link')?.trim();
  const isValidLiveUrl = url && /^https:\/\/.*\.tiktok\.com\/.+\/live(\?.*)?$/.test(url);
  if (!isValidLiveUrl) {
    log(`[${i}] Skip invalid live URL:`, url);
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
  log(`[${i}] Checking ${baseUrl}`);
  
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
    const status = html.includes('"isLiveBroadcast":true') ? 'Live' : 'Offline';
    
    log(`[${i}] Status: ${status} for ${baseUrl}`);
    await updateRowByLink(url, status);
    
  } catch (e) {
    log(`[${i}] Request error:`, e.message);
  }
}

async function updateRowByLink(linkUrl, status) {
  try {
    const rows = await sheet.getRows();
    const row = rows.find(r => getField(r, 'Link')?.trim() === linkUrl);
    if (!row) {
      log(`[updateRowByLink] No row found for link: ${linkUrl}`);
      return;
    }
    const nowIso = new Date().toISOString();
    setField(row, 'Status', status);
    setField(row, 'Last Checked (PST)', nowIso);
    if (status === 'Live') {
      setField(row, 'Last Live (PST)', nowIso);
    }
    const addedDate = getField(row, 'Added Date');
    if (!addedDate) {
      setField(row, 'Added Date', nowIso);
    }
    await row.save();
    log(`[updateRowByLink] Updated: ${linkUrl} => ${status}`);
  } catch (e) {
    log(`[updateRowByLink] Error updating row for ${linkUrl}:`, e.message);
  }
}

async function main() {
  log(`TikTok Live Checker started`);

  while (true) {
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
    }

    for (const { row, i } of prioritized) {
      await checkStatus(row, i);
    }

    const sleepTime = LOOP_DELAY_MIN + Math.random() * (LOOP_DELAY_MAX - LOOP_DELAY_MIN);
    log(`Cycle complete — sleeping ${(sleepTime / 1000).toFixed(0)}s`);
    await delay(sleepTime);
  }
}

main();
