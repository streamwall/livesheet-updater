import { chromium } from 'playwright';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs/promises';

// 🧾 Config
const SHEET_ID = '1amkWpZu5hmI50XGINiz7-02XVNTTZoEARWEVRM-pvKo';
const SHEET_NAME = 'Livesheet';
const RATE_LIVE = 2 * 60 * 1000;      // was 3 mins → now 2
const RATE_OFF = 7 * 60 * 1000;       // was 10 mins → now 7

const PAGE_WAIT_MIN = 6000;           // was 8000
const PAGE_WAIT_MAX = 9000;           // was 12000

const BETWEEN_ROW_DELAY_MIN = 7000;   // was 10000
const BETWEEN_ROW_DELAY_MAX = 12500;  // was 18000

const LOOP_DELAY_MIN = 60000;         // was 85000
const LOOP_DELAY_MAX = 80000;         // was 110000

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const VIEWPORT = { width: 1280, height: 800 };

const delay = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => delay(min + Math.random() * (max - min));
const log = (...args) => console.log(new Date().toISOString(), ...args);

// 📋 Google Sheets setup
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
await sheet.getRows({ limit: 1 }); // force-load headers
log(`Loaded sheet "${sheet.title}", headers:`, JSON.stringify(sheet.headerValues));

// 🔎 Field helpers
function getField(row, name) {
  const idx = sheet.headerValues.findIndex(h => h.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? row._rawData[idx] : undefined;
}
function setField(row, name, val) {
  const idx = sheet.headerValues.findIndex(h => h.toLowerCase() === name.toLowerCase());
  if (idx >= 0) row._rawData[idx] = val;
}

// 🚦 Status checker
async function checkStatus(page, row, i) {
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
  log(`[${i}] Visiting ${baseUrl}`);
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const finalUrl = page.url();
    if (finalUrl.includes('/?_r=1')) {
      log(`[${i}] Redirected to TikTok homepage (offline): ${url}`);
      await updateRowByLink(url, 'Offline');
      return;
    }

    await rand(PAGE_WAIT_MIN, PAGE_WAIT_MAX);
  } catch (e) {
    log(`[${i}] Navigation error:`, e.message);
    return;
  }

  const html = await page.content();
  let status = 'Offline';
  try {
    const viewerIconVisible = await page.locator('svg[aria-label*="viewer"] ~ span').first().isVisible();
    if (viewerIconVisible || html.includes('"isLiveBroadcast":true')) {
      status = 'Live';
    } else if (html.includes('LIVE has ended')) {
      status = 'Offline';
    }
  } catch (e) {
    log(`[${i}] Viewer icon check error:`, e.message);
  }

  await updateRowByLink(url, status);
  await rand(BETWEEN_ROW_DELAY_MIN, BETWEEN_ROW_DELAY_MAX);
}

// 🛡️ Safe update by matching link
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
    await row.save();
    log(`[updateRowByLink] Updated: ${linkUrl} => ${status}`);
  } catch (e) {
    log(`[updateRowByLink] Error updating row for ${linkUrl}:`, e.message);
  }
}

// 🔁 Main loop
async function main() {
  log(`Using UA: ${USER_AGENT}`);

  const context = await chromium.launchPersistentContext(
    './user-data-dir',
    {
      headless: false,
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
      args: ['--disable-blink-features=AutomationControlled']
    }
  );

  // 🥠 Inject cookies if present
  try {
    const cookies = JSON.parse(await fs.readFile('./cookies.json', 'utf8'));
    await context.addCookies(cookies);
    log(`✅ Injected ${cookies.length} cookies from cookies.json`);
  } catch (err) {
    log(`⚠️ No cookies.json loaded:`, err.message);
  }

  const page = await context.newPage();

  while (true) {
    const rows = await sheet.getRows();
    log('Cycle start —', rows.length, 'rows fetched');

    if (rows.length > 0) {
      log('Sample row0:', sheet.headerValues.map((h, idx) => `${h}=${rows[0]._rawData[idx]}`).join('; '));
    }

    for (const [i, row] of rows.sort(() => 0.5 - Math.random()).entries()) {
      await checkStatus(page, row, i);
    }

    const sleepTime = LOOP_DELAY_MIN + Math.random() * (LOOP_DELAY_MAX - LOOP_DELAY_MIN);
    log(`Cycle complete — sleeping ${(sleepTime / 1000).toFixed(0)}s`);
    await delay(sleepTime);
  }
}

main();